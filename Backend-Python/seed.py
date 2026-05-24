import asyncio
import json
import os

from config import settings
from models.course import Course
from repositories import course_repo

async def seed_courses():
    json_path = settings.COURSES_JSON_PATH
    
    with open(json_path, "r") as f:
        courses_data = json.load(f)
    
    print(f"Found {len(courses_data)} courses to insert.")
    
    for c_dict in courses_data:
        course_model = Course(**c_dict)
        await course_repo.upsert_course(course_model)
    
    print("Seeding complete.")
    
if __name__ == "__main__":
    asyncio.run(seed_courses())
