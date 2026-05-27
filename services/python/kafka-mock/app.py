"""
Mock Kafka Service for Event Streaming
Simulates Kafka functionality without requiring full Kafka installation
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from datetime import datetime
import json
from collections import defaultdict
import uvicorn
import os

app = FastAPI(title="Mock Kafka Service")

# In-memory storage for topics and messages
topics: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
consumer_offsets: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))


class ProduceRequest(BaseModel):
    topic: str
    key: Optional[str] = None
    value: Dict[str, Any]
    partition: Optional[int] = 0


class ConsumeRequest(BaseModel):
    topic: str
    consumer_group: str
    max_messages: int = 10


class Message(BaseModel):
    topic: str
    partition: int
    offset: int
    key: Optional[str]
    value: Dict[str, Any]
    timestamp: str


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "kafka-mock",
        "topics_count": len(topics),
        "total_messages": sum(len(messages) for messages in topics.values()),
    }


@app.post("/produce")
async def produce_message(request: ProduceRequest):
    """Produce a message to a topic"""
    message = {
        "topic": request.topic,
        "partition": request.partition,
        "offset": len(topics[request.topic]),
        "key": request.key,
        "value": request.value,
        "timestamp": datetime.utcnow().isoformat(),
    }
    
    topics[request.topic].append(message)
    
    return {
        "success": True,
        "topic": request.topic,
        "partition": request.partition,
        "offset": message["offset"],
        "timestamp": message["timestamp"],
    }


@app.post("/consume")
async def consume_messages(request: ConsumeRequest):
    """Consume messages from a topic"""
    if request.topic not in topics:
        return {
            "success": True,
            "messages": [],
            "count": 0,
        }
    
    # Get current offset for this consumer group
    current_offset = consumer_offsets[request.consumer_group][request.topic]
    
    # Get messages from current offset
    all_messages = topics[request.topic]
    messages = all_messages[current_offset:current_offset + request.max_messages]
    
    # Update offset
    new_offset = current_offset + len(messages)
    consumer_offsets[request.consumer_group][request.topic] = new_offset
    
    return {
        "success": True,
        "messages": messages,
        "count": len(messages),
        "consumer_group": request.consumer_group,
        "current_offset": current_offset,
        "new_offset": new_offset,
    }


@app.get("/topics")
async def list_topics():
    """List all topics"""
    return {
        "topics": [
            {
                "name": topic,
                "message_count": len(messages),
                "partitions": 1,
            }
            for topic, messages in topics.items()
        ],
        "count": len(topics),
    }


@app.get("/topics/{topic}")
async def get_topic(topic: str, limit: int = 100):
    """Get messages from a topic"""
    if topic not in topics:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    messages = topics[topic][-limit:]
    
    return {
        "topic": topic,
        "messages": messages,
        "count": len(messages),
        "total_messages": len(topics[topic]),
    }


@app.delete("/topics/{topic}")
async def delete_topic(topic: str):
    """Delete a topic"""
    if topic in topics:
        del topics[topic]
        return {"success": True, "message": f"Topic {topic} deleted"}
    
    raise HTTPException(status_code=404, detail="Topic not found")


@app.get("/consumer-groups")
async def list_consumer_groups():
    """List all consumer groups"""
    return {
        "consumer_groups": [
            {
                "name": group,
                "topics": list(offsets.keys()),
                "offsets": dict(offsets),
            }
            for group, offsets in consumer_offsets.items()
        ],
        "count": len(consumer_offsets),
    }


@app.post("/topics/{topic}/reset-offset")
async def reset_offset(topic: str, consumer_group: str, offset: int = 0):
    """Reset consumer group offset for a topic"""
    consumer_offsets[consumer_group][topic] = offset
    
    return {
        "success": True,
        "consumer_group": consumer_group,
        "topic": topic,
        "new_offset": offset,
    }


if __name__ == "__main__":
    port = int(os.getenv("PORT", 9092))
    uvicorn.run(app, host="0.0.0.0", port=port)
