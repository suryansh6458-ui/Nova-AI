
# NOVA AI — Personal Voice Assistant

A cross-platform personal assistant with a Python backend and browser dashboard.

## Features

- AI chat using the OpenAI API
- Browser speech recognition where supported
- Text-to-speech responses
- English and Hindi voice options
- Safe calculator
- Notes saved in SQLite
- Date and time commands
- Approved website shortcuts
- Responsive desktop and tablet interface

## Windows installation

1. Install Python 3.10 or newer.
2. Open the NOVA_AI folder in VS Code.
3. Open Terminal.

Run:

    py -m venv .venv
    .venv\Scripts\Activate.ps1
    pip install -r requirements.txt

4. Copy `.env.example` and rename the copy to `.env`.
5. Add your API key in `.env`.
6. Start NOVA:

    python app.py

7. Open this address:

    http://127.0.0.1:5000

## iPad installation

1. Deploy the Python project to a hosting service that supports HTTPS.
2. Set the environment variables on the hosting service.
3. Open the deployed HTTPS address in Safari.
4. Allow microphone access if requested.

Speech recognition depends on browser support. Typing is available as a fallback.

## Example commands

- What is Python?
- Explain photosynthesis simply.
- Calculate 456 times 789.
- What time is it?
- Create a note: revise thermodynamics.
- Show my notes.
- Open YouTube.

## Security

- Never publish your `.env` file.
- Keep your API key private.
- The application does not execute shell commands.
- It does not send messages, make purchases or control arbitrary apps.
- API usage may incur charges.
- A hosting service without persistent storage may erase saved notes.
