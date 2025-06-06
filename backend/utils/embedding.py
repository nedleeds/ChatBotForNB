import os
from typing import List

from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_core.documents.base import Document

# 임베딩 모델 이름을 rag.py와 동일하게 text-embedding-3-small로 설정
EMBEDDING_MODEL_NAME = "text-embedding-3-small"


def build_vector_store(documents: List[Document], index_dir: str = None) -> None:
    """
    documents: LangChain Document 객체 리스트 (청크 분할된 상태)
    index_dir: FAISS index를 저장할 경로. None이면 기본(data/tmp/faiss_index)에 저장
    """
    if index_dir is None:
        index_dir = os.path.join(os.path.dirname(__file__), "../data/tmp/faiss_index")

    os.makedirs(index_dir, exist_ok=True)

    embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL_NAME)
    vector_store = FAISS.from_documents(documents, embedding=embeddings)
    vector_store.save_local(index_dir)


def load_vector_store(index_dir: str = None) -> FAISS:
    """
    index_dir: FAISS 인덱스가 저장된 경로. None이면 기본(data/faiss_index) 사용
    """
    if index_dir is None:
        index_dir = os.path.join(os.path.dirname(__file__), "../data/faiss_index")

    embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL_NAME)
    db = FAISS.load_local(
        index_dir,
        embeddings,
        allow_dangerous_deserialization=True
    )
    return db
