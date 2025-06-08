# backend/utils/rag.py
import re
import os
import json

from typing import List, Dict, Any, Optional
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents.base import Document
from langchain.prompts import PromptTemplate
from langchain_core.runnables import Runnable  # ← 이 부분 추가
from langchain.schema.output_parser import StrOutputParser
from pydantic import BaseModel
from fastapi import HTTPException

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def get_rag_chain() -> Runnable:
    """
    RAG용 PromptTemplate과 LLM(여기서는 gpt-4o-mini)을 연결한 체인을 반환합니다.
    """
    template = """
    다음의 컨텍스트를 활용해서 질문에 답변해줘
    - 질문에 대한 응답을 해줘
    - 간결하게 5줄 이내로 해줘
    - 곧바로 응답결과를 말해줘

    컨텍스트 : {context}

    질문: {question}

    응답:"""

    custom_rag_prompt = PromptTemplate.from_template(template)
    model = ChatOpenAI(model="gpt-4o-mini")

    return custom_rag_prompt | model | StrOutputParser()


def process_question(
    user_question: str, index_dir: str, top_k: int = 3
) -> Dict[str, Any]:
    """
    1) FAISS 인덱스 로드
    2) Retriever로 상위 top_k개 Document 검색
    3) 각 Document의 metadata(pdf_name, page, image_path)를 활용해
       컨텍스트 문자열을 생성
    4) get_rag_chain()으로 RAG 체인 실행해 답변 생성
    5) {"answer": str, "sources": List[{"pdf_name","page","text","image_path"}]} 형태로 반환
    """
    # 1) FAISS 인덱스 로드
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    db = FAISS.load_local(index_dir, embeddings, allow_dangerous_deserialization=True)

    # 2) Retriever 생성 후 상위 top_k개 Document 검색
    retriever = db.as_retriever(search_kwargs={"k": top_k})
    retrieved_docs: List[Document] = retriever.get_relevant_documents(user_question)

    # 3) 검색된 Document 각각에서 metadata를 가져와 컨텍스트 파트와 sources 리스트 구성
    context_parts = []
    sources: List[Dict[str, Any]] = []

    for doc in retrieved_docs:
        # 3-1) metadata에서 필요한 값을 꺼내기
        md = doc.metadata or {}
        pdf_name = md.get("pdf_name", "UnknownPDF")
        page_no = md.get("page", None)
        image_path = md.get("image_path", None)

        text = doc.page_content or ""

        # 3-2) 컨텍스트 문자열 예시: "[reportA.pdf - Page 3]\n해당 페이지 텍스트..."
        if page_no is not None:
            context_parts.append(f"[{pdf_name} - Page {page_no + 1}]\n{text}")
        else:
            # page 정보가 없으면 그냥 pdf 이름만 붙임
            context_parts.append(f"[{pdf_name}]\n{text}")

        # 3-3) sources 리스트에 리턴할 딕셔너리
        sources.append(
            {
                "pdf_name": pdf_name,
                "page": page_no,
                "text": text,
                "image_path": image_path,
            }
        )

    # 3-4) context를 한 문자열로 합치기 (페이지별로 두 줄 띄어쓰기)
    context_str = "\n\n".join(context_parts)

    # 4) RAG 체인 실행
    chain = get_rag_chain()
    result = chain.invoke({"context": context_str, "question": user_question})
    answer = result.strip()

    # 5) 최종 리턴
    return {"answer": answer, "sources": sources}


class MCQItem(BaseModel):
    id: Optional[int] = None
    question: str
    choices: List[str]
    answerIndex: int


def generate_mc_questions(index_dir: str, n_questions: int = 5) -> List[MCQItem]:
    """
    FAISS 인덱스에서 상위 컨텍스트를 추출하여,
    객관식 문제를 생성합니다.
    """
    # 1) FAISS 인덱스 로드 및 retriever
    embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    db = FAISS.load_local(index_dir, embeddings, allow_dangerous_deserialization=True)
    retriever = db.as_retriever(search_kwargs={"k": 3})
    docs: List[Document] = retriever.get_relevant_documents("")

    # 2) 컨텍스트 합치기
    context = "\n\n".join(doc.page_content for doc in docs)

    # 3) MCQ 생성 프롬프트 구성 (예시 JSON 중괄호 이스케이프)
    prompt_tpl = """
    다음 컨텍스트를 바탕으로 객관식 4지선다 문제 {n}개를 JSON 형식으로 생성하세요.
    출력 형식 예시:
    [  {{ "question": "예시 질문?", "choices": ["A","B","C","D"], "answerIndex": 2 }}  , … ]

    컨텍스트:
    {context}
    """

    prompt = PromptTemplate.from_template(prompt_tpl)

    # 4) LLM 체인 실행
    chain: Runnable = (
        prompt | ChatOpenAI(model="gpt-4o-mini", temperature=0.7) | StrOutputParser()
    )

    try:
        raw = chain.invoke({"context": context, "n": n_questions})
        cleaned = re.sub(r"```[^\n]*\n", "", raw)
        cleaned = cleaned.replace("```", "")
        json_str = cleaned.strip()
        items = json.loads(json_str)
    except json.JSONDecodeError as e:
        # 디버깅: LLM 응답과 정제된 문자열을 로그에 남기고 예외 던짐
        print("❌ Failed to parse JSON. raw:", repr(raw))
        print("❌ Cleaned JSON str:", json_str)
        raise HTTPException(
            status_code=500, detail="MCQ 생성 실패 (잘못된 JSON 응답)"
        ) from e

    # 5) 데이터 모델링
    mcqs: List[MCQItem] = []
    for idx, item in enumerate(items, start=1):
        mcqs.append(
            MCQItem(
                id=idx,
                question=item.get("question"),
                choices=item.get("choices", []),
                answerIndex=item.get("answerIndex", 0),
            )
        )
    return mcqs
