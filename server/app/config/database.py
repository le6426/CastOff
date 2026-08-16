import psycopg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "dbname=omoggle")

'''
Connects to the database using the DATABASE_URL from the .env file. 
If the DATABASE_URL is not set, it defaults to "dbname=omoggle".
'''
def get_connection():
    return psycopg.connect(DATABASE_URL)
