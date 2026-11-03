FROM python:3.11-slim
WORKDIR /service
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN useradd -m embed && mkdir -p /home/embed/.cache/huggingface && chown -R embed:embed /home/embed/.cache
USER embed
ENV HF_HOME=/home/embed/.cache/huggingface
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000"]
