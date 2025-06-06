import os
import time
import shutil
import traceback
from typing import List, Dict, Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from utils.pdf import pdf_to_documents  # 이미지 변환은 제거됨
from utils.embedding import build_vector_store
from utils.rag import process_question

app = FastAPI()

# ─────────────────────────────────────────────────────────────────────────────
# (1) Electron ↔ FastAPI 간 통신을 허용하기 위해 CORS를 넓게 오픈
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# StaticFiles로 data/ 디렉토리를 /static 경로로 마운트
# → React에서 http://localhost:8088/static/... 으로 접근 가능
data_dir = os.path.join(os.path.dirname(__file__), "data")
app.mount(
    "/static",
    StaticFiles(directory=data_dir),
    name="static",
)


# ─────────────────────────────────────────────────────────────────────────────
# (2) 학습된 챗봇 목록 조회 엔드포인트
@app.get("/chatbots", response_model=List[Dict[str, Any]])
async def list_chatbots(company: str, team: str, part: str):
    base_data_dir = os.path.join(os.path.dirname(__file__), "data")
    target_dir = os.path.join(base_data_dir, company, team, part)

    if not os.path.isdir(target_dir):
        return []

    chatbots: List[Dict[str, Any]] = []
    for chatbot_name in os.listdir(target_dir):
        chatbot_dir = os.path.join(target_dir, chatbot_name)
        faiss_dir = os.path.join(chatbot_dir, "faiss_index")
        if not os.path.isdir(faiss_dir):
            continue

        # ── PDF 파일명 찾기 ──
        pdf_url = None
        pdf_folder = os.path.join(chatbot_dir, "pdf")
        if os.path.isdir(pdf_folder):
            # .pdf 확장자를 가진 파일 중 첫 번째를 사용
            for fname in os.listdir(pdf_folder):
                if fname.lower().endswith(".pdf"):
                    full_pdf_path = os.path.join(pdf_folder, fname)
                    # data_dir 기준으로 상대경로를 구해 "/static/..." 형태로 만듦
                    rel_pdf = os.path.relpath(full_pdf_path, base_data_dir).replace(
                        "\\", "/"
                    )
                    pdf_url = f"/static/{rel_pdf}"
                    break

        try:
            created_ts = os.path.getctime(faiss_dir)
            modified_ts = os.path.getmtime(faiss_dir)
        except OSError:
            created_ts = time.time()
            modified_ts = time.time()

        chatbots.append(
            {
                "name": chatbot_name,
                "company": company,
                "team": team,
                "part": part,
                "indexPath": faiss_dir,
                "createdAt": int(created_ts * 1000),
                "lastTrainedAt": int(modified_ts * 1000),
                "pdf_url": pdf_url,  # 없으면 None
            }
        )

    chatbots.sort(key=lambda x: x["createdAt"], reverse=True)
    return chatbots


# ─────────────────────────────────────────────────────────────────────────────
# (3) 챗봇 삭제 엔드포인트
@app.delete("/chatbots")
async def delete_chatbot(
    company: str = Query(...),
    team: str = Query(...),
    part: str = Query(...),
    chatbot_name: str = Query(...),
):
    base_data_dir = os.path.join(os.path.dirname(__file__), "data")
    chatbot_dir = os.path.join(base_data_dir, company, team, part, chatbot_name)

    if not os.path.isdir(chatbot_dir):
        raise HTTPException(status_code=404, detail="해당 챗봇을 찾을 수 없습니다.")

    try:
        print(f"[DELETE] Attempting to remove directory: {chatbot_dir}")
        shutil.rmtree(chatbot_dir)
        return {"success": True}
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[DELETE] Error while deleting chatbot:\n{tb}")
        raise HTTPException(status_code=500, detail=f"챗봇 삭제 실패: {str(e)}")


# ─────────────────────────────────────────────────────────────────────────────
# (4) PDF 업로드 + 벡터 인덱스 생성 엔드포인트
@app.post("/upload_pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    company: str = Form(...),
    team: str = Form(...),
    part: str = Form(...),
    chatbot_name: str = Form(...),
):
    """
    1) PDF 파일을 data/{company}/{team}/{part}/{chatbot_name}/pdf/{chatbot_name}.pdf 로 저장
    2) 그 PDF를 Document로 변환 → 벡터 인덱스 생성 (data/.../faiss_index)
    3) 성공 응답과 함께, 저장된 PDF의 /static 경로를 반환
    """

    # 1) 경로(디렉토리) 정의
    base_data_dir = data_dir  # 이미 위에서 data_dir로 정의됨 (backend/data)
    chatbot_base_dir = os.path.join(base_data_dir, company, team, part, chatbot_name)

    pdf_folder = os.path.join(chatbot_base_dir, "pdf")
    faiss_folder = os.path.join(chatbot_base_dir, "faiss_index")

    # 디렉토리가 존재하지 않으면 생성
    os.makedirs(pdf_folder, exist_ok=True)
    os.makedirs(faiss_folder, exist_ok=True)

    # 2) PDF 저장: 파일은 그대로 사용
    original_filename = file.filename
    saved_pdf_path = os.path.join(pdf_folder, original_filename)
    contents = await file.read()
    with open(saved_pdf_path, "wb") as f:
        f.write(contents)

    # 3) PDF → Document 리스트로 변환 (텍스트 추출 등)
    try:
        docs = pdf_to_documents(saved_pdf_path)
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[UPLOAD_PDF] PDF → Document 변환 중 오류:\n{tb}")
        raise HTTPException(status_code=500, detail=f"PDF 파싱 실패: {e}")

    # 4) FAISS 벡터 인덱스 생성
    try:
        build_vector_store(docs, index_dir=faiss_folder)
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[UPLOAD_PDF] 벡터 인덱스 생성 중 오류:\n{tb}")
        raise HTTPException(status_code=500, detail=f"벡터 인덱스 생성 실패: {e}")

    # 5) 최종 응답: PDF URL과 벡터 인덱스 경로 반환
    return {
        "message": "PDF 업로드 및 벡터 저장 완료",
        "pdf_url": saved_pdf_path,
        "faiss_index_dir": faiss_folder,
    }


# ─────────────────────────────────────────────────────────────────────────────
# (5) RAG+FAISS를 이용한 Chat 엔드포인트
class ChatRequest(BaseModel):
    company: str
    team: str
    part: str
    chatbot_name: str
    question: str
    chat_history: List[Dict[str, str]] = []


class ChatResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    company = request.company.strip()
    team = request.team.strip()
    part = request.part.strip()
    chatbot_name = request.chatbot_name.strip()
    question = request.question.strip()
    chat_history = request.chat_history or []

    if not (company and team and part and chatbot_name):
        raise HTTPException(
            status_code=400, detail="company, team, part, chatbot_name 모두 필요합니다."
        )
    if not question:
        raise HTTPException(status_code=400, detail="질문이 비어 있습니다.")

    base_data_dir = data_dir  # "/.../backend/data"
    faiss_folder = os.path.join(
        base_data_dir, company, team, part, chatbot_name, "faiss_index"
    )

    if not os.path.isdir(faiss_folder):
        raise HTTPException(
            status_code=404,
            detail=f"'{chatbot_name}' 챗봇의 FAISS 인덱스를 찾을 수 없습니다.",
        )

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
