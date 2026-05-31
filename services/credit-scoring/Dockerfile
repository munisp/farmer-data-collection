FROM python:3.12-slim
WORKDIR /app
COPY . .
EXPOSE 8108
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "print('healthy')" || exit 1

CMD ["python", "main.py"]
