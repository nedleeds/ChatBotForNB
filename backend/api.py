import os
import time
import shutil
import traceback
import json
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from utils.pdf import pdf_to_documents
from utils.embedding import build_vector_store
from utils.rag import process_question, generate_mc_questions

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# StaticFiles 설정
base_dir = os.path.dirname(__file__)
data_dir = os.path.join(base_dir, "data")
app.mount("/static", StaticFiles(directory=data_dir), name="static")


# QnA 스키마
class QuestionModel(BaseModel):
    id: Optional[int] = None
    question: str
    choices: List[str]
    answerIndex: int


class QnAResponse(BaseModel):
    questions: List[QuestionModel]

    # backend/api.py


# QnA 삭제(단일 문항) 엔드포인트
@app.delete("/api/qna/question", response_model=QnAResponse)
def delete_qna_question(
    company: str = Query(...),
    team: str = Query(...),
    part: str = Query(...),
    chatbot_name: str = Query(...),
    question_id: int = Query(..., description="삭제할 문항 ID"),
):
    """
    qna.json에서 지정된 id의 질문을 삭제하고, 결과를 반환합니다.
    """
    base = os.path.join(data_dir, company, team, part, chatbot_name)
    file_path = os.path.join(base, "qna", "qna.json")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="QnA 파일이 존재하지 않습니다.")

    # 로드
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="QnA 파일 로드 실패")

    # 필터링
    new_data = [item for item in data if item.get("id") != question_id]

    # 저장
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(new_data, f, ensure_ascii=False, indent=2)
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="QnA 파일 저장 실패")

    # Pydantic 모델로 래핑
    questions = [QuestionModel(**item) for item in new_data]
    return QnAResponse(questions=questions)


# QnA 생성/로드 엔드포인트
@app.post("/api/qna", response_model=QnAResponse)
def create_or_load_qna(
    company: str = Query(...),
    team: str = Query(...),
    part: str = Query(...),
    chatbot_name: str = Query(...),
    force: bool = Query(False, description="강제 재생성 여부"),
    n_questions: int = Query(5, description="생성할 문제 개수"),
):
    """
    데이터 폴더 내 챗봇별 FAISS 인덱스를 바탕으로 객관식 문제를 생성하고 qna/qna.json에 저장하거나,
    이미 존재하면 해당 파일을 불러옵니다.
    """
    base = os.path.join(data_dir, company, team, part, chatbot_name)
    index_dir = os.path.join(base, "faiss_index")
    if not os.path.isdir(index_dir):
        raise HTTPException(
            status_code=404, detail="먼저 PDF를 업로드하고 인덱스를 생성하세요."
        )

    qna_folder = os.path.join(base, "qna")
    os.makedirs(qna_folder, exist_ok=True)
    file_path = os.path.join(qna_folder, "qna.json")

    # ── 디버깅 로그 ──
    print(f"[QnA] company={company}, team={team}, part={part}, bot={chatbot_name}")
    print(f"[QnA] qna_folder: {qna_folder}")
    print(f"[QnA] file_path: {file_path}")
    print(f"[QnA] exists before generation: {os.path.exists(file_path)}")

    if force or not os.path.exists(file_path):
        # 새로 생성
        questions = generate_mc_questions(index_dir=index_dir, n_questions=n_questions)
        # ID 부여
        for idx, q in enumerate(questions, start=1):
            q.id = idx
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump([q.dict() for q in questions], f, ensure_ascii=False, indent=2)
    else:
        # 기존 로드
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            questions = [QuestionModel(**item) for item in data]
        except Exception:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="QnA 파일 로드 실패")
    # MCQItem을 QuestionModel로 변환
    qm_list = [QuestionModel(**q.dict()) for q in questions]
    return QnAResponse(questions=qm_list)


# QnA 추가 엔드포인트
@app.post("/api/qna/append", response_model=QnAResponse)
def append_qna(
    company: str = Query(...),
    team: str = Query(...),
    part: str = Query(...),
    chatbot_name: str = Query(...),
    n_questions: int = Query(5, description="추가 생성할 문제 개수"),
):
    """
    기존 qna.json에 추가 문제를 생성해 이어붙이고 전체 반환합니다.
    """
    base = os.path.join(data_dir, company, team, part, chatbot_name)
    index_dir = os.path.join(base, "faiss_index")
    if not os.path.isdir(index_dir):
        raise HTTPException(
            status_code=404, detail="먼저 PDF를 업로드하고 인덱스를 생성하세요."
        )

    qna_folder = os.path.join(base, "qna")
    file_path = os.path.join(qna_folder, "qna.json")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="먼저 /api/qna로 생성해주세요.")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="기존 QnA 파일 로드 실패")

    new_qs = generate_mc_questions(index_dir=index_dir, n_questions=n_questions)
    base_id = max((item.get("id", 0) for item in existing), default=0)
    for i, q in enumerate(new_qs, start=1):
        q.id = base_id + i
        existing.append(q.dict())

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="QnA 파일 저장 실패")

    return QnAResponse(questions=[QuestionModel(**item) for item in existing])


# ─────────────────────────────────────────────────────────────────────────────
# (2) 학습된 챗봇 목록 조회 엔드포인트
@app.get("/chatbots", response_model=List[Dict[str, Any]])
async def list_chatbots(company: str, team: str, part: str):
    target_dir = os.path.join(data_dir, company, team, part)
    if not os.path.isdir(target_dir):
        return []
    chatbots: List[Dict[str, Any]] = []
    for name in os.listdir(target_dir):
        bot_dir = os.path.join(target_dir, name)
        faiss_dir = os.path.join(bot_dir, "faiss_index")
        if not os.path.isdir(faiss_dir):
            continue
        pdf_url = None
        pdf_folder = os.path.join(bot_dir, "pdf")
        if os.path.isdir(pdf_folder):
            for fname in os.listdir(pdf_folder):
                if fname.lower().endswith(".pdf"):
                    rel = os.path.relpath(
                        os.path.join(pdf_folder, fname), data_dir
                    ).replace("\\", "/")
                    pdf_url = f"/static/{rel}"
                    break
        try:
            c = os.path.getctime(faiss_dir)
            m = os.path.getmtime(faiss_dir)
        except OSError:
            c = m = time.time()
        chatbots.append(
            {
                "name": name,
                "company": company,
                "team": team,
                "part": part,
                "indexPath": faiss_dir,
                "createdAt": int(c * 1000),
                "lastTrainedAt": int(m * 1000),
                "pdf_url": pdf_url,
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
    chatbot_dir = os.path.join(data_dir, company, team, part, chatbot_name)
    if not os.path.isdir(chatbot_dir):
        raise HTTPException(status_code=404, detail="챗봇을 찾을 수 없습니다.")
    try:
        shutil.rmtree(chatbot_dir)
        return {"success": True}
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="챗봇 삭제 실패")


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
    chatbot_base = os.path.join(data_dir, company, team, part, chatbot_name)
    pdf_folder = os.path.join(chatbot_base, "pdf")
    faiss_folder = os.path.join(chatbot_base, "faiss_index")
    os.makedirs(pdf_folder, exist_ok=True)
    os.makedirs(faiss_folder, exist_ok=True)
    path = os.path.join(pdf_folder, file.filename)
    contents = await file.read()
    with open(path, "wb") as f:
        f.write(contents)
    try:
        docs = pdf_to_documents(path)
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="PDF 파싱 실패")
    try:
        build_vector_store(docs, index_dir=faiss_folder)
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="벡터 인덱스 생성 실패")
    return {"message": "완료", "pdf_url": path, "faiss_index_dir": faiss_folder}


# ─────────────────────────────────────────────────────────────────────────────
# (5) RAG+FAISS Chat 엔드포인트
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
    if not all([company, team, part, chatbot_name, question]):
        raise HTTPException(status_code=400, detail="파라미터 누락")
    faiss_folder = os.path.join(
        data_dir, company, team, part, chatbot_name, "faiss_index"
    )
    if not os.path.isdir(faiss_folder):
        raise HTTPException(status_code=404, detail="FAISS 인덱스 없음")
    try:
        result = process_question(user_question=question, index_dir=faiss_folder)
        return ChatResponse(answer=result["answer"], sources=result["sources"])
    except Exception:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="서버 오류")
