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


# ─────────────────────────────────────────────────────────────────────────────
# 로그인 옵션 제공 모델 및 엔드포인트
# ─────────────────────────────────────────────────────────────────────────────
class CompanyCreate(BaseModel):
    company: str


class TeamCreate(BaseModel):
    company: str
    team: str


class PartCreate(BaseModel):
    company: str
    team: str
    part: str


class PartOption(BaseModel):
    name: str
    # (필요하면) 이 파트에 속한 사번 목록까지 포함
    employees: List[str] = []


class TeamOption(BaseModel):
    name: str
    parts: List[PartOption]


class CompanyOption(BaseModel):
    name: str
    teams: List[TeamOption]


class LoginOptions(BaseModel):
    companies: List[CompanyOption]


class CurrentLoginInfo(BaseModel):
    company: Optional[str] = None
    team: Optional[str] = None
    part: Optional[str] = None
    employeeID: Optional[str] = None


class LoginResponse(BaseModel):
    companies: List[str]
    teams: List[str]
    parts: List[str]
    employees: List[str]


def ensure_dir(path: str):
    try:
        os.makedirs(path, exist_ok=True)
    except OSError as e:
        raise HTTPException(500, f"디렉터리 생성 실패: {e}")


def scan_subdirs(dir_path):
    """dir_path 아래의 하위 디렉터리 이름 목록 반환"""
    if not os.path.isdir(dir_path):
        return []
    return [
        name
        for name in os.listdir(dir_path)
        if os.path.isdir(os.path.join(dir_path, name))
    ]


def list_subdirs(path: str) -> List[str]:
    if not os.path.isdir(path):
        return []
    return [
        name for name in os.listdir(path) if os.path.isdir(os.path.join(path, name))
    ]


def load_employees(part_dir):
    """part_dir/employees.json 파일이 있으면 리스트로 로드, 아니면 빈 리스트"""
    emp_file = os.path.join(part_dir, "employees.json")
    if not os.path.isfile(emp_file):
        return []
    try:
        with open(emp_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, IOError):
        return []


def init_employees_file(part_dir: str):
    emp_file = os.path.join(part_dir, "employees.json")
    if not os.path.exists(emp_file):
        with open(emp_file, "w", encoding="utf-8") as f:
            json.dump([], f, ensure_ascii=False)


@app.get("/api/login", response_model=LoginOptions)
def get_login_options():
    companies: List[CompanyOption] = []

    # data/ 아래에서 회사 디렉터리 반복
    for comp_name in scan_subdirs(data_dir):
        comp_dir = os.path.join(data_dir, comp_name)

        teams: List[TeamOption] = []
        for team_name in scan_subdirs(comp_dir):
            team_dir = os.path.join(comp_dir, team_name)

            parts: List[PartOption] = []
            for part_name in scan_subdirs(team_dir):
                part_dir = os.path.join(team_dir, part_name)
                # employees.json 읽어서 리스트로
                emp_list = load_employees(part_dir)
                parts.append(PartOption(name=part_name, employees=emp_list))

            teams.append(TeamOption(name=team_name, parts=parts))

        companies.append(CompanyOption(name=comp_name, teams=teams))

    return LoginOptions(companies=companies)


@app.post("/api/login")
async def add_employee(info: CurrentLoginInfo):
    """
    company/team/part 경로 아래에 employees.json을 만들고,
    중복 없이 employeeID를 추가합니다.
    """
    target_dir = os.path.join(data_dir, info.company, info.team, info.part)
    try:
        os.makedirs(target_dir, exist_ok=True)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"디렉터리 생성 실패: {e}")

# 3) employees.json 읽고, 없으면 새로 만들고, 중복 없이 추가
    emp_file = os.path.join(target_dir, "employees.json")
    if os.path.isfile(emp_file):
        try:
            with open(emp_file, "r", encoding="utf-8") as f:
                employees = json.load(f)
        except (json.JSONDecodeError, IOError):
            employees = []
    else:
        employees = []

    if info.employeeID not in employees:
        employees.append(info.employeeID)
        try:
            with open(emp_file, "w", encoding="utf-8") as f:
                json.dump(employees, f, ensure_ascii=False, indent=2)
        except IOError as e:
            raise HTTPException(status_code=500, detail=f"employees.json 쓰기 실패: {e}")

    return {"status": "ok", "employees": employees}

@app.post("/api/company")
def add_company(info: CompanyCreate):
    global data_dir
    comp_dir = os.path.join(data_dir, info.company)
    ensure_dir(comp_dir)
    # 성공 시 회사 목록 반환
    return {"status": "ok", "companies": list_subdirs(data_dir)}


@app.post("/api/team")
def add_team(info: TeamCreate):
    global data_dir
    comp_dir = os.path.join(data_dir, info.company)
    if not os.path.isdir(comp_dir):
        raise HTTPException(404, f"회사 '{info.company}'를 찾을 수 없습니다.")
    team_dir = os.path.join(comp_dir, info.team)
    ensure_dir(team_dir)
    return {"status": "ok", "teams": list_subdirs(comp_dir)}


@app.post("/api/part")
def add_part(info: PartCreate):
    global data_dir
    team_dir = os.path.join(data_dir, info.company, info.team)
    if not os.path.isdir(team_dir):
        raise HTTPException(
            404, f"회사/팀 '{info.company}/{info.team}'를 찾을 수 없습니다."
        )
    part_dir = os.path.join(team_dir, info.part)
    ensure_dir(part_dir)
    init_employees_file(part_dir)
    return {"status": "ok", "parts": list_subdirs(team_dir)}


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
