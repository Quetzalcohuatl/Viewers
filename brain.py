# # Save as brain.py
# from fastapi import FastAPI
# from pydantic import BaseModel
# from fastapi.middleware.cors import CORSMiddleware

# app = FastAPI()
# app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# class Query(BaseModel):
#     image: str # Base64
#     question: str

# @app.post("/ask")
# async def ask(q: Query):
#     # Here is where you'd call your LLM
#     return {"answer": f"I received your question: '{q.question}'. (LLM integration pending)"}

# if __name__ == "__main__":
#     import uvicorn
#     #uvicorn.run(app, port=8000)
#     # WSL fix?
#     # Change 127.0.0.1 to 0.0.0.0
#     uvicorn.run(app, host="0.0.0.0", port=8000)


import io
import base64
import torch
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText

app = FastAPI()

# 1. Setup CORS so OHIF can talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Initialize Model and Processor
model_id = "google/medgemma-1.5-4b-it"
# model_id = "google/medgemma-27b-it"

print(f"Loading {model_id}...")
# We use bfloat16 as recommended for Gemma/MedGemma models
model = AutoModelForImageTextToText.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto", # Automatically puts on GPU if available
)
processor = AutoProcessor.from_pretrained(model_id)
print("Model loaded successfully!")

# --- NEW: Session Storage ---
# Stores history as { "study_uid": [messages] }
sessions = {}

class Query(BaseModel):
    image: str # Base64 string from OHIF
    question: str
    studyInstanceUID: str # New field from frontend

@app.post("/ask")
async def ask(q: Query):
    try:
        uid = q.studyInstanceUID
        
        # 1. Initialize session if new
        if uid not in sessions:
            print(f"New Study detected: {uid}. Starting fresh conversation.")
            sessions[uid] = []

        # 3. Decode Base64 image from OHIF to PIL
        image_data = q.image.split(",")[1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # 3. Add User Message to History
        # We include the image in the current turn. 
        # Note: If memory becomes an issue, you can remove 'image' from older turns in the list.
        sessions[uid].append({
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": q.question}
            ]
        })

        # 5. Process input using the chat template
        inputs = processor.apply_chat_template(
            sessions[uid], 
            add_generation_prompt=True, 
            tokenize=True,
            return_dict=True, 
            return_tensors="pt"
        ).to(model.device, dtype=torch.bfloat16)

        input_len = inputs["input_ids"].shape[-1]

        # 6. Generate Response
        with torch.inference_mode():
            generation = model.generate(
                **inputs, 
                max_new_tokens=500, # Adjust based on how long you want answers to be
                do_sample=False
            )
            # Remove the input tokens from the output to get only the answer
            generation = generation[0][input_len:]

        # 7. Decode and Return
        decoded = processor.decode(generation, skip_special_tokens=True)
        print(f"Question: {q.question}\nAI: {decoded}")

        # 6. Save AI Response to History so it remembers what it said
        sessions[uid].append({
            "role": "assistant",
            "content": [
                {"type": "text", "text": decoded.strip()}
            ]
        })

         # Keep history from growing too large (Optional: keep last 10 turns)
        if len(sessions[uid]) > 10:
            sessions[uid] = sessions[uid][-10:]

        return {"answer": decoded.strip()}

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return {"answer": f"Error in Brain: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 is best for WSL to Windows communication
    uvicorn.run(app, host="0.0.0.0", port=8000)