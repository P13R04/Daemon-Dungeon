import json
import os
import re
import urllib.request
import time

# Options (ajustez selon votre besoin)
# Utiliser OpenAI API ou simuler/générer localement avec votre propre interface
# Ce script lit BONUS_ARTWORK_PIPELINE.md et extrait le JSON.
API_KEY = os.environ.get("OPENAI_API_KEY", "YOUR_API_KEY")
MD_FILE_PATH = "../docs/project/BONUS_ARTWORK_PIPELINE.md"
OUTPUT_DIR = "../public/bonuses"  # Modifiez le dossier d'output si besoin

def extract_json_from_md(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract JSON inside ```json ... ```
    match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
    if not match:
        raise ValueError("Could not find JSON block in MD file.")
    
    return json.loads(match.group(1))

def generate_image_openai(prompt, filename):
    import requests
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    
    payload = {
        "model": "dall-e-3",
        "prompt": prompt,
        "n": 1,
        "size": "1024x1024"
    }

    print(f"Generating image for {filename}...")
    response = requests.post("https://api.openai.com/v1/images/generations", headers=headers, json=payload)
    response_data = response.json()
    
    if "error" in response_data:
        print(f"Error: {response_data['error']['message']}")
        return False
        
    image_url = response_data['data'][0]['url']
    
    # Download the image
    file_path = os.path.join(OUTPUT_DIR, f"{filename}.png")
    urllib.request.urlretrieve(image_url, file_path)
    print(f"✅ Saved to {file_path}")
    return True

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    print(f"Reading pipeline config from {MD_FILE_PATH}...")
    try:
        pipeline_data = extract_json_from_md(MD_FILE_PATH)
    except Exception as e:
        print(f"Error reading MD: {e}")
        # Relative path fallback if executed from root
        try:
            pipeline_data = extract_json_from_md("docs/project/BONUS_ARTWORK_PIPELINE.md")
            global OUTPUT_DIR
            OUTPUT_DIR = "public/bonuses"
            if not os.path.exists(OUTPUT_DIR):
                os.makedirs(OUTPUT_DIR)
        except Exception as e2:
            print("Failed to find docs. Please run from the 'scripts' folder or the project root.")
            return

    config = pipeline_data["pipeline_config"]
    color_schemes = pipeline_data["color_schemes"]
    bonuses = pipeline_data["bonuses"]
    
    print(f"Found {len(bonuses)} bonuses to generate.")
    
    for bonus in bonuses:
        bonus_id = bonus["id"]
        category = bonus["category"]
        specific_prompt = bonus["specific_prompt"]
        
        # Get color scheme
        color_scheme = color_schemes.get(category, "bright neon colors")
        
        # Construct full prompt
        base = config["base_prompt"].replace("{COLOR_SCHEME}", color_scheme)
        full_prompt = f"{base} {specific_prompt}"
        
        file_dest = os.path.join(OUTPUT_DIR, f"{bonus_id}.png")
        if os.path.exists(file_dest):
            print(f"⏭️  Skipping {bonus_id}, already exists.")
            continue
            
        print(f"--- Prompt: {full_prompt}")
        
        # Replace this function block with whatever generation API you prefer!
        success = False
        if API_KEY != "YOUR_API_KEY":
             # Use OpenAI API
            success = generate_image_openai(full_prompt, bonus_id)
            time.sleep(2) # Avoid rate limits
        else:
             print(f"⚠️ API_KEY is missing. Please set OPENAI_API_KEY to generate {bonus_id}.png automatically.")
             print(f"Expected output path: {file_dest}")
             time.sleep(0.5)

if __name__ == "__main__":
    main()
