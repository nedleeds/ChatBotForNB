import os
import time
import shutil
import traceback
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from utils.pdf import save_uploadedfile, pdf_to_documents, convert_pdf_to_images
from utils.embedding import build_vector_store
from utils.rag import process_question

app = FastAPI()

# (1) Electron ↔ FastAPI 간 통신을 허용하기 위해 CORS를 넓게 오픈
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 로컬 데스크톱 앱이라면 "*"로 두어도 무방
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# (2) 학습된 챗봇 목록 조회 엔드포인트 (신규 추가)
@app.get("/chatbots", response_model=List[Dict[str, Any]])
async def list_chatbots(company: str, team: str, part: str):
    """
    data/{company}/{team}/{part} 하위 폴더(챗봇 이름)를 스캔하여,
    각 챗봇 폴더 내에 'faiss_index' 디렉토리가 존재하면 '학습된 챗봇'으로 간주하고
    [{"name", "company", "team", "part", "indexPath", "createdAt", "lastTrainedAt"}, …] 형태로 반환.
    """

    base_data_dir = os.path.join(os.path.dirname(__file__), "data")
    target_dir = os.path.join(base_data_dir, company, team, part)

    # 해당 경로가 없으면 빈 리스트 반환
    if not os.path.isdir(target_dir):
        return []

    chatbots: List[Dict[str, Any]] = []
    for chatbot_name in os.listdir(target_dir):
        chatbot_dir = os.path.join(target_dir, chatbot_name)
        faiss_dir = os.path.join(chatbot_dir, "faiss_index")
        if not os.path.isdir(faiss_dir):
            # faiss_index 폴더가 없으면 학습되지 않은 챗봇이므로 무시
            continue

        # faiss_index 디렉토리의 생성 시간 & 수정 시간을 가져옴
        try:
            created_ts = os.path.getctime(faiss_dir)
            modified_ts = os.path.getmtime(faiss_dir)
        except OSError:
            # 윈도우나 일부 환경에서 ctime이 변할 수 있으니 예외 처리
            created_ts = time.time()
            modified_ts = time.time()

        chatbots.append(
            {
                "name": chatbot_name,
                "company": company,
                "team": team,
                "part": part,
                "indexPath": faiss_dir,
                # JS에서 new Date(ms)로 쓰기 위해 밀리초 단위로 보냄
                "createdAt": int(created_ts * 1000),
                "lastTrainedAt": int(modified_ts * 1000),
            }
        )

    # 생성 시간순으로 정렬하고 싶으면 아래 줄을 사용 (Descending 등)
    chatbots.sort(key=lambda x: x["createdAt"], reverse=True)

    return chatbots


# ─────────────────────────────────────────────────────────────────────────────
# (3) 챗봇 삭제 엔드포인트 (신규 추가)
@app.delete("/chatbots")
async def delete_chatbot(
    company: str = Query(...),
    team: str = Query(...),
    part: str = Query(...),
    chatbot_name: str = Query(...)
):
    """
    data/{company}/{team}/{part}/{chatbot_name} 폴더를 삭제합니다.
    """
    base_data_dir = os.path.join(os.path.dirname(__file__), "data")
    chatbot_dir = os.path.join(base_data_dir, company, team, part, chatbot_name)

    if not os.path.isdir(chatbot_dir):
        raise HTTPException(status_code=404, detail="해당 챗봇을 찾을 수 없습니다.")

    try:
        # 삭제 전, 실제 경로가 제대로 잡혔는지 로그에 찍어 봅시다
        print(f"[DELETE] Attempting to remove directory: {chatbot_dir}")
        shutil.rmtree(chatbot_dir)
        return {"success": True}
    except Exception as e:
        # 에러 시 자세한 스택트레이스와 함께 HTTPException을 던집니다
        tb = traceback.format_exc()
        print(f"[DELETE] Error while deleting chatbot:\n{tb}")
        raise HTTPException(status_code=500, detail=f"챗봇 삭제 실패: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# (4) PDF 업로드 + 벡터 인덱스 생성 엔드포인트 (기존 로직 유지)
@app.post("/upload_pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    company: str = Form(...),
    team: str = Form(...),
    part: str = Form(...),
    chatbot_name: str = Form(...),
):
    """
    1) PDF 파일을 읽어서 특정 폴더(data/{company}/{team}/{part}/{chatbot_name}/pdf)에 저장
    2) 그 PDF를 Document로 변환 → 청크 분할 → 해당 챗봇 폴더(data/.../faiss_index)에 벡터 인덱스 생성
    3) 성공 응답과 함께, 저장된 PDF 경로와 벡터 인덱스 경로를 반환
    """

    # 1) 경로(디렉토리) 정의
    #    backend/data/회사/팀/파트/챗봇명/pdf
    #    backend/data/회사/팀/파트/챗봇명/faiss_index
    base_data_dir = os.path.join(os.path.dirname(__file__), "data")
    pdf_folder = os.path.join(base_data_dir, company, team, part, chatbot_name, "pdf")
    faiss_folder = os.path.join(
        base_data_dir, company, team, part, chatbot_name, "faiss_index"
    )

    # 디렉토리가 존재하지 않으면 생성
    os.makedirs(pdf_folder, exist_ok=True)
    os.makedirs(faiss_folder, exist_ok=True)

    # 2) PDF 저장
    contents = await file.read()
    saved_pdf_path = os.path.join(pdf_folder, file.filename)
    with open(saved_pdf_path, "wb") as f:
        f.write(contents)

    # 3) PDF → Document 리스트로 변환
    docs = pdf_to_documents(saved_pdf_path)

    # (필요시) 청크 분할 로직을 여기서 호출하거나, pdf_to_documents 내부에서 분할해도 무방합니다.
    # 예를 들어, utils/pdf.py 내부에 chunk_documents 함수가 따로 있으면:
    # from utils.pdf import chunk_documents
    # docs = chunk_documents(docs)

    # 4) FAISS 벡터 인덱스 생성
    build_vector_store(docs, index_dir=faiss_folder)

    return {
        "message": "PDF 업로드 및 벡터 저장 완료",
        "pdf_path": saved_pdf_path,
        "faiss_index_dir": faiss_folder,
    }


# ─────────────────────────────────────────────────────────────────────────────
# (5) RAG+FAISS를 이용한 Chat 엔드포인트 (수정된 부분)
# ─────────────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    company: str
    team: str
    part: str
    chatbot_name: str
    question: str
    chat_history: List[Dict[str, str]] = []  # [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]


class ChatResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]  # [{"page": int, "text": str}, …]


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    클라이언트로부터 받은 JSON:
      {
        "company": "...",
        "team": "...",
        "part": "...",
        "chatbot_name": "...",
        "question": "...",
        "chat_history": [ { "role": "user", "content": "..." }, … ]
      }
    내부에서는 FAISS 인덱스 폴더를 찾아서 process_question을 호출합니다.
    """

    company = request.company.strip()
    team = request.team.strip()
    part = request.part.strip()
    chatbot_name = request.chatbot_name.strip()
    question = request.question.strip()
    chat_history = request.chat_history or []

    if not (company and team and part and chatbot_name):
        raise HTTPException(status_code=400, detail="company,team,part,chatbot_name 모두 필요합니다.")
    if not question:
        raise HTTPException(status_code=400, detail="질문이 비어 있습니다.")

    base_data_dir = os.path.join(os.path.dirname(__file__), "data")
    faiss_folder = os.path.join(base_data_dir, company, team, part, chatbot_name, "faiss_index")

    if not os.path.isdir(faiss_folder):
        raise HTTPException(status_code=404, detail=f"'{chatbot_name}' 챗봇의 FAISS 인덱스를 찾을 수 없습니다.")

    try:
        result = process_question(
            user_question=question,
            index_dir=faiss_folder,
        )
        return ChatResponse(answer=result["answer"], sources=result["sources"])

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[CHAT] Error while processing question:\n{tb}")
        raise HTTPException(status_code=500, detail="서버 내부 오류가 발생했습니다.")
