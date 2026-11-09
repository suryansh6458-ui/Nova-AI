
const $ = id => document.getElementById(id);

let history = [];
let recognition = null;
let listening = false;

let pin = sessionStorage.getItem("nova_pin") || "";

let speakOn =
    localStorage.getItem("nova_speak") !== "false";

let keepHistory =
    localStorage.getItem("nova_history") !== "false";


// API REQUESTS

function headers() {
    let h = {
        "Content-Type": "application/json"
    };

    if (pin) {
        h["X-Nova-Pin"] = pin;
    }

    return h;
}


async function api(url, opts = {}) {

    let response = await fetch(url, {
        ...opts,
        headers: {
            ...headers(),
            ...(opts.headers || {})
        }
    });

    let data = await response.json().catch(() => ({}));

    if (response.status === 401 && !pin) {

        let enteredPin = prompt("Enter your NOVA access PIN:");

        if (enteredPin) {
            pin = enteredPin;
            sessionStorage.setItem("nova_pin", pin);

            return api(url, opts);
        }
    }

    if (!response.ok) {
        throw Error(data.error || "Request failed.");
    }

    return data;
}


// CHAT DISPLAY

function add(role, text) {

    let row = document.createElement("div");
    row.className = "msg " + role;

    let avatar = document.createElement("div");
    avatar.className = "avatar";

    avatar.textContent = role === "nova" ? "N" : "YOU";

    let bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    row.append(avatar, bubble);

    $("messages").append(row);

    $("messages").scrollTop =
        $("messages").scrollHeight;
}


// VOICE STATUS

function state(status, subtitle) {

    $("voicePrompt").textContent =
        status.toUpperCase();

    $("voiceSub").textContent = subtitle;

    $("voice").textContent = status;

    $("orb").classList.toggle(
        "active",
        status.toLowerCase().includes("listening")
    );
}


// TEXT TO SPEECH

function speak(text) {

    if (!speakOn || !window.speechSynthesis) {
        return;
    }

    speechSynthesis.cancel();

    let utterance =
        new SpeechSynthesisUtterance(text.slice(0, 2500));

    utterance.lang = $("language").value;

    speechSynthesis.speak(utterance);
}


function stop() {

    if (window.speechSynthesis) {
        speechSynthesis.cancel();
    }
}


// SPEECH RECOGNITION

function startVoice() {

    let SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

    if (!SpeechRecognition) {

        add(
            "nova",
            "Speech recognition is unavailable in this browser. Please type your request."
        );

        state(
            "Text mode",
            "Use the message box instead."
        );

        return;
    }

    if (listening && recognition) {
        recognition.stop();
        return;
    }

    recognition = new SpeechRecognition();

    recognition.lang = $("language").value;
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {

        listening = true;

        $("mic").textContent = "◉";

        state("Listening", "Speak now.");
    };


    recognition.onresult = event => {

        let transcript =
            event.results[0][0].transcript;

        $("prompt").value = transcript;

        handle(transcript);
    };


    recognition.onerror = event => {

        state(
            "Voice unavailable",
            "Try again or type your command. " + event.error
        );
    };


    recognition.onend = () => {

        listening = false;

        $("mic").textContent = "🎙";

        if ($("voicePrompt").textContent === "LISTENING") {

            state(
                "Standby",
                "Press the microphone and speak naturally"
            );
        }
    };


    try {
        recognition.start();
    } catch (error) {

        state(
            "Voice unavailable",
            "Please try again."
        );
    }
}


// WEBSITE LAUNCHER

function site(name) {

    let websites = {
        google: "https://www.google.com",
        youtube: "https://www.youtube.com",
        wikipedia: "https://www.wikipedia.org"
    };

    if (websites[name]) {

        window.open(
            websites[name],
            "_blank",
            "noopener,noreferrer"
        );

        return true;
    }

    return false;
}


// CALCULATOR COMMAND CONVERSION

function expression(text) {

    return text
        .replace(/^(calculate|compute|what is)\s+/i, "")
        .replace(/multiplied by|times/gi, "*")
        .replace(/divided by/gi, "/")
        .replace(/plus/gi, "+")
        .replace(/minus/gi, "-")
        .replace(/×/g, "*")
        .replace(/÷/g, "/");
}


// MAIN COMMAND PROCESSOR

async function handle(raw) {

    let text = raw.trim();

    if (!text) {
        return;
    }

    $("prompt").value = "";

    add("user", text);

    if (keepHistory) {
        history.push({
            role: "user",
            content: text
        });
    }

    let lower = text.toLowerCase();


    // STOP SPEAKING

    if (/^(stop|stop speaking|be quiet)$/.test(lower)) {

        stop();

        add("nova", "Speech stopped.");

        return;
    }


    // TIME COMMAND

    if (/^(time|what time is it|current time)$/.test(lower)) {

        let answer =
            "The time is " + new Date().toLocaleTimeString();

        add("nova", answer);

        speak(answer);

        return;
    }


    // DATE COMMAND

    if (/^(date|today's date|what is the date)$/.test(lower)) {

        let answer =
            "Today is " +
            new Date().toLocaleDateString(
                undefined,
                { dateStyle: "full" }
            );

        add("nova", answer);

        speak(answer);

        return;
    }


    // OPEN WEBSITE COMMAND

    if (/^(open )?(google|youtube|wikipedia)$/.test(lower)) {

        let name = lower.replace(/^open /, "");

        site(name);

        let answer = "Opening " + name + " in a new tab.";

        add("nova", answer);

        speak(answer);

        return;
    }


    // SHOW NOTES COMMAND

    if (/^(show|read|list) my notes$/.test(lower)) {

        await loadNotes(true);

        return;
    }


    // CALCULATOR COMMAND

    if (/^(calculate|compute|what is)\s+[\d(]/i.test(text)) {

        try {

            let data = await api(
                "/api/calculate",
                {
                    method: "POST",

                    body: JSON.stringify({
                        expression: expression(text)
                    })
                }
            );

            let answer = "The result is " + data.result;

            add("nova", answer);

            speak(answer);

        } catch (error) {

            add("nova", "Calculator: " + error.message);
        }

        return;
    }


    // CREATE NOTE COMMAND

    let noteMatch = text.match(
        /^(create|add|save) (a )?note[: ]+(.+)$/i
    );

    if (noteMatch) {

        try {

            let data = await api(
                "/api/notes",
                {
                    method: "POST",

                    body: JSON.stringify({
                        body: noteMatch[3]
                    })
                }
            );

            add(
                "nova",
                "Your note has been saved: " + data.body
            );

            speak("Your note has been saved.");

        } catch (error) {

            add("nova", error.message);
        }

        return;
    }


    // AI RESPONSE

    let waiting = document.createElement("div");

    waiting.className = "msg nova";

    waiting.innerHTML =
        '<div class="avatar">N</div>' +
        '<div class="bubble">NOVA is thinking…</div>';

    $("messages").append(waiting);


    try {

        let data = await api(
            "/api/chat",
            {
                method: "POST",

                body: JSON.stringify({
                    message: text,
                    history: history.slice(-11, -1)
                })
            }
        );

        waiting.remove();

        add("nova", data.reply);

        if (keepHistory) {

            history.push({
                role: "assistant",
                content: data.reply
            });
        }

        speak(data.reply);

    } catch (error) {

        waiting.remove();

        add("nova", error.message);

        speak(error.message);
    }
}


// CHAT FORM

$("chatForm").addEventListener("submit", event => {

    event.preventDefault();

    handle($("prompt").value);
});


// MICROPHONE BUTTON

$("mic").onclick = startVoice;


// STOP BUTTON

$("stop").onclick = stop;


// CLEAR CHAT

$("clear").onclick = () => {

    history = [];

    $("messages").innerHTML = "";

    add(
        "nova",
        "Conversation cleared. What would you like to do?"
    );
};


// PAGE NAVIGATION

document.querySelectorAll(".nav").forEach(button => {

    button.onclick = () => {

        document.querySelectorAll(".nav")
            .forEach(x => x.classList.remove("active"));

        document.querySelectorAll(".view")
            .forEach(x => x.classList.remove("active"));

        button.classList.add("active");

        $(button.dataset.view).classList.add("active");

        if (button.dataset.view === "notes") {
            loadNotes();
        }
    };
});


// SAVE NOTE

$("saveNote").onclick = async () => {

    let body = $("noteText").value.trim();

    if (!body) {
        return;
    }

    try {

        await api(
            "/api/notes",
            {
                method: "POST",

                body: JSON.stringify({ body })
            }
        );

        $("noteText").value = "";

        loadNotes();

    } catch (error) {

        alert(error.message);
    }
};


// LOAD NOTES

async function loadNotes(announce = false) {

    try {

        let data = await api("/api/notes");

        let list = $("noteList");

        list.innerHTML = "";

        if (!data.notes.length) {
            list.textContent = "No notes yet.";
        }


        data.notes.forEach(note => {

            let card = document.createElement("article");

            card.className = "panel note";

            let paragraph = document.createElement("p");

            paragraph.textContent = note.body;

            let meta = document.createElement("div");

            meta.className = "meta";

            meta.textContent = note.created_at;

            let deleteButton = document.createElement("button");

            deleteButton.className = "delete";

            deleteButton.textContent = "Delete";

            deleteButton.onclick = async () => {

                if (confirm("Delete this note?")) {

                    try {

                        await api(
                            "/api/notes/" + note.id,
                            { method: "DELETE" }
                        );

                        loadNotes();

                    } catch (error) {

                        alert(error.message);
                    }
                }
            };

            card.append(
                paragraph,
                meta,
                deleteButton
            );

            list.append(card);
        });


        if (announce) {

            let answer = data.notes.length
                ? "You have " + data.notes.length + " saved notes."
                : "You have no saved notes.";

            add("nova", answer);

            speak(answer);
        }

    } catch (error) {

        $("noteList").textContent = error.message;
    }
}


// CALCULATOR TOOL

$("calc").onclick = async () => {

    try {

        let data = await api(
            "/api/calculate",
            {
                method: "POST",

                body: JSON.stringify({
                    expression: $("expr").value
                })
            }
        );

        $("calcResult").textContent =
            "Result: " + data.result;

    } catch (error) {

        $("calcResult").textContent = error.message;
    }
};


// WEBSITE BUTTONS

document.querySelectorAll("[data-site]").forEach(button => {

    button.onclick = () => site(button.dataset.site);
});


// VOICE TEST

$("voiceTest").onclick = () => {

    if (!window.speechSynthesis) {

        $("voiceResult").textContent =
            "Speech output is not supported.";

        return;
    }

    $("voiceResult").textContent = "Speaking…";

    speak("Hello. This is NOVA voice output.");
};


// SETTINGS WINDOW

$("settings").onclick = () => {

    $("speakToggle").checked = speakOn;

    $("historyToggle").checked = keepHistory;

    $("settingsDialog").showModal();
};


$("closeSettings").onclick = () => {

    $("settingsDialog").close();
};


$("saveSettings").onclick = () => {

    speakOn = $("speakToggle").checked;

    keepHistory = $("historyToggle").checked;

    localStorage.setItem("nova_speak", speakOn);

    localStorage.setItem("nova_history", keepHistory);

    if (!keepHistory) {
        history = [];
    }

    $("settingsDialog").close();
};


// LIVE CLOCK

function updateClock() {

    $("clock").textContent =
        new Date().toLocaleTimeString();
}

setInterval(updateClock, 1000);

updateClock();


// PLATFORM DETECTION

(async () => {

    $("status").textContent = "CHECKING";

    try {

        let data = await api("/api/status");

        $("status").textContent = "SYSTEM ONLINE";

        $("engine").textContent =
            data.ai_ready ? data.model : "API key needed";

    } catch (error) {

        $("status").textContent = "CHECK CONNECTION";

        $("engine").textContent = "Unavailable";
    }

})();
