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
    
def change_username(old_name, new_name, password):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username = ? AND password = ?", (old_name, password))
        if c.fetchone() is None:
            return False, "wachtwoord klopt niet"
        try:
            c.execute("UPDATE users SET username = ? WHERE username = ?", (new_name, old_name))
            conn.commit()
            return True, "succes"
        except sqlite3.IntegrityError:
            return False, "gebruikersnaam al in gebruik"

def change_password(username, old_pw, new_pw):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, old_pw))
        if c.fetchone() is None:
            return False, "oud wachtwoord fout"
        c.execute("UPDATE users SET password = ? WHERE username = ?", (new_pw, username))
        conn.commit()
        return True, "succes"