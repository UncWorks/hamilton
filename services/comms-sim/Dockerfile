# syntax=docker/dockerfile:1.6

FROM python:3.12-slim
WORKDIR /app

COPY services/comms-sim/pyproject.toml ./pyproject.toml
COPY services/comms-sim/src ./src

RUN pip install --no-cache-dir -e .

ENTRYPOINT ["comms-sim"]
