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

def get_user_stats(username):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        c.execute("""
            SELECT snake_wins, snake_losses, snake_highscore,
                   pong_wins, pong_losses, total_wins
            FROM users WHERE username = ?
        """, (username,))
        row = c.fetchone()
        if row:
            keys = ["snake_wins", "snake_losses", "snake_highscore",
                    "pong_wins", "pong_losses", "total_wins"]
            return dict(zip(keys, row))
        return {}

def update_stats(username, game, did_win, score):
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()

        if game == "snake":
            if did_win:
                c.execute("UPDATE users SET snake_wins = snake_wins + 1, total_wins = total_wins + 1 WHERE username = ?", (username,))
            else:
                c.execute("UPDATE users SET snake_losses = snake_losses + 1 WHERE username = ?", (username,))
            
            c.execute("SELECT snake_highscore FROM users WHERE username = ?", (username,))
            high = c.fetchone()
            if high and score > (high[0] or 0):
                c.execute("UPDATE users SET snake_highscore = ? WHERE username = ?", (score, username))

        elif game == "pong":
            if did_win:
                c.execute("UPDATE users SET pong_wins = pong_wins + 1, total_wins = total_wins + 1 WHERE username = ?", (username,))
            else:
                c.execute("UPDATE users SET pong_losses = pong_losses + 1 WHERE username = ?", (username,))
        
        conn.commit()