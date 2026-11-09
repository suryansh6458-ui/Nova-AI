
import os
import ast
import operator
import sqlite3
from datetime import datetime
from functools import wraps

from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "nova_notes.db")
PIN = os.getenv("NOVA_ACCESS_PIN", "").strip()
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.5")

app = Flask(__name__, static_folder="static")

# Create the notes database automatically.
with sqlite3.connect(DB) as con:
    con.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)


# Optional PIN protection for API endpoints.
def protect(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if PIN and request.headers.get("X-Nova-Pin", "") != PIN:
            return jsonify(error="Incorrect NOVA access PIN."), 401
        return fn(*args, **kwargs)
    return wrapped


@app.get("/")
def home():
    return send_from_directory("static", "index.html")


@app.get("/<path:path>")
def static_file(path):
    return send_from_directory("static", path)


@app.get("/api/status")
@protect
def status():
    return jsonify(
        ok=True,
        ai_ready=bool(os.getenv("OPENAI_API_KEY")),
        model=MODEL
    )


# AI conversation endpoint.
@app.post("/api/chat")
@protect
def chat():
    data = request.get_json(silent=True) or {}

    message = str(data.get("message", "")).strip()
    history = data.get("history", [])

    if not message or len(message) > 6000:
        return jsonify(
            error="Enter a message under 6000 characters."
        ), 400

    if not os.getenv("OPENAI_API_KEY"):
        return jsonify(
            error="AI is not configured. Add OPENAI_API_KEY to your private .env file."
        ), 503

    safe_history = []

    if isinstance(history, list):
        for item in history[-10:]:
            if (
                isinstance(item, dict)
                and item.get("role") in ("user", "assistant")
                and isinstance(item.get("content"), str)
            ):
                safe_history.append({
                    "role": item["role"],
                    "content": item["content"][:2500]
                })

    try:
        client = OpenAI()

        response = client.responses.create(
            model=MODEL,
            instructions=(
                "You are NOVA, a helpful, age-appropriate personal assistant. "
                "Be honest about your capabilities. "
                "Never claim an action happened unless confirmed. "
                "Do not request passwords or secrets. "
                "For consequential actions, explain the steps and require "
                "the user's confirmation."
            ),
            input=safe_history + [
                {"role": "user", "content": message}
            ]
        )

        return jsonify(
            reply=response.output_text or
            "I couldn't generate a response."
        )

    except Exception as exc:
        print(
            "NOVA API error:",
            type(exc).__name__,
            str(exc)[:250]
        )

        return jsonify(
            error=(
                "AI request failed. Check your API key, model, "
                "internet connection and API account."
            )
        ), 502


# Retrieve saved notes.
@app.get("/api/notes")
@protect
def notes():
    with sqlite3.connect(DB) as con:
        con.row_factory = sqlite3.Row

        rows = con.execute("""
            SELECT id, body, created_at
            FROM notes
            ORDER BY id DESC
            LIMIT 100
        """).fetchall()

    return jsonify(notes=[dict(x) for x in rows])


# Save a new note.
@app.post("/api/notes")
@protect
def add_note():
    body = str(
        (request.get_json(silent=True) or {}).get("body", "")
    ).strip()

    if not body or len(body) > 2000:
        return jsonify(
            error="Note must contain 1–2000 characters."
        ), 400

    created = datetime.now().strftime("%Y-%m-%d %H:%M")

    with sqlite3.connect(DB) as con:
        cur = con.execute(
            "INSERT INTO notes(body, created_at) VALUES (?, ?)",
            (body, created)
        )

        note_id = cur.lastrowid

    return jsonify(
        ok=True,
        id=note_id,
        body=body,
        created_at=created
    )


# Delete a note.
@app.delete("/api/notes/<int:note_id>")
@protect
def delete_note(note_id):
    with sqlite3.connect(DB) as con:
        cur = con.execute(
            "DELETE FROM notes WHERE id=?",
            (note_id,)
        )

    if not cur.rowcount:
        return jsonify(error="Note not found."), 404

    return jsonify(ok=True)


# Safe calculator: only basic arithmetic is allowed.
OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow
}

UNARY = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg
}


def calculate_expr(expr):
    if len(expr) > 100:
        raise ValueError("Expression too long.")

    tree = ast.parse(expr, mode="eval")

    def evaluate(node):
        if isinstance(node, ast.Expression):
            return evaluate(node.body)

        if (
            isinstance(node, ast.Constant)
            and type(node.value) in (int, float)
        ):
            return node.value

        if isinstance(node, ast.BinOp) and type(node.op) in OPS:
            right = evaluate(node.right)

            if isinstance(node.op, ast.Pow) and abs(right) > 8:
                raise ValueError("Exponent too large.")

            result = OPS[type(node.op)](
                evaluate(node.left),
                right
            )

            if abs(result) > 10**15:
                raise ValueError("Result too large.")

            return result

        if isinstance(node, ast.UnaryOp) and type(node.op) in UNARY:
            return UNARY[type(node.op)](
                evaluate(node.operand)
            )

        raise ValueError("Only basic arithmetic is allowed.")

    return evaluate(tree)


@app.post("/api/calculate")
@protect
def calc():
    expr = str(
        (request.get_json(silent=True) or {}).get(
            "expression", ""
        )
    ).strip()

    try:
        return jsonify(result=calculate_expr(expr))

    except ZeroDivisionError:
        return jsonify(error="Cannot divide by zero."), 400

    except Exception as exc:
        return jsonify(
            error=str(exc) or "Invalid expression."
        ), 400


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("PORT", "5000")),
        debug=False
    )
