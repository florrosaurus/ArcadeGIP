import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL
            )
        """)
        conn.commit()

def register_user(username, password):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        try:
            c.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False  # username bestaat al

def verify_login(username, password):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
        return c.fetchone() is not None