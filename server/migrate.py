import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")

def column_exists(cursor, table, column):
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [info[1] for info in cursor.fetchall()]
    return column in columns

def add_column_if_missing(cursor, table, column, coltype, default):
    if not column_exists(cursor, table, column):
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coltype} DEFAULT {default}")
        print(f"added column: {column}")
    else:
        print(f"column already exists: {column}")

def migrate():
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        add_column_if_missing(c, "users", "snake_wins", "INTEGER", 0)
        add_column_if_missing(c, "users", "snake_losses", "INTEGER", 0)
        add_column_if_missing(c, "users", "snake_highscore", "INTEGER", 0)
        add_column_if_missing(c, "users", "pong_wins", "INTEGER", 0)
        add_column_if_missing(c, "users", "pong_losses", "INTEGER", 0)
        add_column_if_missing(c, "users", "total_wins", "INTEGER", 0)
        conn.commit()

if __name__ == "__main__":
    migrate()