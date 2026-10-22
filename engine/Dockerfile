# GPU image for the Unsolvable.ai engine. Build from the repo root:
#   docker build -f engine/Dockerfile -t unsolvable-engine .
FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/data/hf \
    ENGINE_DATA_DIR=/data/engine

# espeak-ng: Kokoro's fallback for words outside its dictionary. fonts-dejavu: burned-in captions.
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng fonts-dejavu-core git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY engine/requirements.txt engine/requirements.txt
RUN pip install --no-cache-dir -r engine/requirements.txt
COPY engine engine

EXPOSE 8000
# Model weights download to /data/hf on first use; mount a volume there so they survive restarts.
CMD ["uvicorn", "engine.app:app", "--host", "0.0.0.0", "--port", "8000"]
