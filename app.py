import os
import sqlite3
from datetime import date, timedelta, datetime
from functools import wraps

from flask import (Flask, render_template, jsonify, request,
                   redirect, url_for, session, flash)
from werkzeug.security import generate_password_hash, check_password_hash
from data import roadmap_data, skills_order

app = Flask(__name__)
app.secret_key = "aiforge-secret-key-2024"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB = "/tmp/users.db" if os.environ.get("VERCEL") else os.path.join(BASE_DIR, "users.db")


# ── Jinja filter ──────────────────────────────────────────────────────────────
@app.template_filter("select_in")
def select_in_filter(iterable, collection):
    return [item for item in collection if item in iterable]


# ── Database ──────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = sqlite3.connect(DB)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT    UNIQUE NOT NULL,
            email    TEXT    UNIQUE NOT NULL,
            password TEXT    NOT NULL,
            created  TEXT    DEFAULT (datetime('now')),
            theme    TEXT    DEFAULT 'light'
        );
        CREATE TABLE IF NOT EXISTS progress (
            user_id    INTEGER NOT NULL,
            skill_id   TEXT    NOT NULL,
            topic      TEXT    NOT NULL,
            checked_at TEXT    DEFAULT (date('now')),
            PRIMARY KEY (user_id, skill_id, topic),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    """)
    # Migrations
    ucols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "theme" not in ucols:
        conn.execute("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'light'")
    pcols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
    if "checked_at" not in pcols:
        conn.execute("ALTER TABLE progress ADD COLUMN checked_at TEXT DEFAULT (date('now'))")
    conn.commit()
    conn.close()


# Run before every request
@app.before_request
def ensure_db():
    init_db()
    # Clear session if the stored user_id no longer exists in DB
    uid = session.get("user_id")
    if uid:
        db   = get_db()
        user = db.execute("SELECT id FROM users WHERE id=?", (uid,)).fetchone()
        db.close()
        if not user:
            session.clear()


# ── Auth helpers ──────────────────────────────────────────────────────────────
def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    db   = get_db()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    db.close()
    if user is None:
        session.clear()  # stale cookie — user deleted from DB
    return user


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            flash("Please log in to continue.", "info")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


# ── Progress helpers ──────────────────────────────────────────────────────────
def get_user_progress(user_id):
    db   = get_db()
    rows = db.execute("SELECT skill_id, topic FROM progress WHERE user_id=?", (user_id,)).fetchall()
    db.close()
    progress = {}
    for r in rows:
        progress.setdefault(r["skill_id"], []).append(r["topic"])
    return progress


def compute_skill_progress(skill_id, progress):
    skill = roadmap_data.get(skill_id)
    if not skill or not skill["days"]:
        return 0
    total = sum(len(d["topics"]) for d in skill["days"])
    if total == 0:
        return 0
    return round((len(progress.get(skill_id, [])) / total) * 100)


# ── Auth routes ───────────────────────────────────────────────────────────────
@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user():
        return redirect(url_for("index"))
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email    = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm  = request.form.get("confirm", "")

        error = None
        if not username or not email or not password:
            error = "All fields are required."
        elif len(username) < 3:
            error = "Username must be at least 3 characters."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        elif password != confirm:
            error = "Passwords do not match."

        if not error:
            try:
                db = get_db()
                db.execute(
                    "INSERT INTO users (username, email, password) VALUES (?,?,?)",
                    (username, email, generate_password_hash(password))
                )
                db.commit()
                db.close()
                flash("Account created! Please log in.", "success")
                return redirect(url_for("login"))
            except sqlite3.IntegrityError:
                error = "Username or email already exists."

        flash(error, "error")
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user():
        return redirect(url_for("index"))
    if request.method == "POST":
        identifier = request.form.get("identifier", "").strip()
        password   = request.form.get("password", "")

        db   = get_db()
        user = db.execute(
            "SELECT * FROM users WHERE username=? OR email=?",
            (identifier, identifier.lower())
        ).fetchone()
        db.close()

        if user and check_password_hash(user["password"], password):
            session["user_id"]  = user["id"]
            session["username"] = user["username"]
            flash(f"Welcome back, {user['username']}!", "success")
            return redirect(url_for("index"))

        flash("Invalid username/email or password.", "error")
    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    flash("You've been logged out.", "info")
    return redirect(url_for("login"))


# ── Heatmap helper ────────────────────────────────────────────────────────────
def build_heatmap(user_id):
    today = date.today()
    # Start from the Sunday of the week 52 weeks ago
    start = today - timedelta(weeks=52)
    start = start - timedelta(days=start.weekday() + 1)  # rewind to Sunday
    if start.weekday() != 6:                              # ensure it IS Sunday
        start = start - timedelta(days=(start.weekday() + 1) % 7)

    db   = get_db()
    rows = db.execute(
        "SELECT checked_at, COUNT(*) as cnt FROM progress "
        "WHERE user_id=? AND checked_at IS NOT NULL GROUP BY checked_at",
        (user_id,)
    ).fetchall()
    db.close()

    activity = {r["checked_at"]: r["cnt"] for r in rows}

    # Build weeks (columns) × 7 days
    weeks = []
    day   = start
    while day <= today:
        week = []
        for _ in range(7):
            ds  = day.isoformat()
            cnt = activity.get(ds, 0)
            week.append({"date": ds, "count": cnt, "future": day > today})
            day += timedelta(days=1)
        weeks.append(week)

    # Month labels — find first day of each month in range
    month_labels = []
    seen = set()
    for w_idx, week in enumerate(weeks):
        for cell in week:
            if cell["future"]:
                continue
            m = cell["date"][:7]
            if m not in seen:
                seen.add(m)
                month_labels.append({
                    "label": datetime.strptime(cell["date"], "%Y-%m-%d").strftime("%b"),
                    "week":  w_idx
                })

    # Streak calculation
    current_streak = longest_streak = temp = 0
    d = today
    # current streak: walk backwards from today
    while d >= start:
        if activity.get(d.isoformat(), 0) > 0:
            current_streak += 1
            d -= timedelta(days=1)
        else:
            break
    # longest streak: walk full range
    d = start
    while d <= today:
        if activity.get(d.isoformat(), 0) > 0:
            temp += 1
            longest_streak = max(longest_streak, temp)
        else:
            temp = 0
        d += timedelta(days=1)

    total_active_days = len([v for v in activity.values() if v > 0])

    return {
        "weeks":            weeks,
        "month_labels":     month_labels,
        "current_streak":   current_streak,
        "longest_streak":   longest_streak,
        "total_active_days": total_active_days,
        "max_count":        max(activity.values(), default=1),
    }


# ── Profile route ────────────────────────────────────────────────────────────
@app.route("/profile")
@login_required
def profile():
    uid      = session["user_id"]
    user     = current_user()
    progress = get_user_progress(uid)

    skills_data = []
    total_topics_all   = 0
    completed_topics   = 0

    for sid in skills_order:
        skill = roadmap_data[sid]
        total  = sum(len(d["topics"]) for d in skill["days"])
        done   = len(progress.get(sid, []))
        pct    = round((done / total) * 100) if total else 0
        total_topics_all += total
        completed_topics += done
        skills_data.append({
            "id":       sid,
            "name":     skill["name"],
            "icon":     skill["icon"],
            "total":    total,
            "done":     done,
            "progress": pct,
        })

    learned   = [s for s in skills_data if s["progress"] == 100 and s["total"] > 0]
    ongoing   = [s for s in skills_data if 0 < s["progress"] < 100]
    not_started = [s for s in skills_data if s["progress"] == 0]

    overall_pct = round((completed_topics / total_topics_all) * 100) if total_topics_all else 0

    stats = {
        "total_skills":     len(skills_order),
        "learned":          len(learned),
        "ongoing":          len(ongoing),
        "not_started":      len(not_started),
        "topics_done":      completed_topics,
        "topics_total":     total_topics_all,
        "overall_pct":      overall_pct,
    }

    heatmap = build_heatmap(uid)

    return render_template(
        "profile.html",
        user=user,
        stats=stats,
        learned=learned,
        ongoing=ongoing,
        not_started=not_started,
        heatmap=heatmap,
        user_theme=user["theme"],
    )


# ── Main routes ───────────────────────────────────────────────────────────────
@app.route("/")
def index():
    user       = current_user()
    progress   = get_user_progress(user["id"]) if user else {}
    skills     = []
    for sid in skills_order:
        s = roadmap_data[sid].copy()
        s["progress"] = compute_skill_progress(sid, progress)
        skills.append(s)
    user_theme = user["theme"] if user else "light"
    return render_template("index.html", skills=skills, user=user, user_theme=user_theme)


@app.route("/roadmap/<skill_id>")
def roadmap(skill_id):
    skill = roadmap_data.get(skill_id)
    if not skill:
        return "Skill not found", 404
    user           = current_user()
    progress       = get_user_progress(user["id"]) if user else {}
    checked_topics = set(progress.get(skill_id, []))
    total_topics   = sum(len(d["topics"]) for d in skill["days"])
    completion     = compute_skill_progress(skill_id, progress)
    user_theme     = user["theme"] if user else "light"
    return render_template(
        "roadmap.html",
        skill=skill,
        checked_topics=checked_topics,
        total_topics=total_topics,
        completion=completion,
        user=user,
        user_theme=user_theme,
    )


# ── Progress API ──────────────────────────────────────────────────────────────
@app.route("/api/progress", methods=["POST"])
@login_required
def update_progress():
    data     = request.get_json()
    skill_id = data.get("skill_id")
    topic    = data.get("topic")
    checked  = data.get("checked")

    if not skill_id or topic is None:
        return jsonify({"error": "Invalid data"}), 400

    uid = session["user_id"]
    db  = get_db()
    if checked:
        db.execute(
            "INSERT OR IGNORE INTO progress (user_id, skill_id, topic, checked_at) VALUES (?,?,?,date('now'))",
            (uid, skill_id, topic)
        )
    else:
        db.execute(
            "DELETE FROM progress WHERE user_id=? AND skill_id=? AND topic=?",
            (uid, skill_id, topic)
        )
    db.commit()
    db.close()

    progress = get_user_progress(uid)
    skill    = roadmap_data.get(skill_id)
    total    = sum(len(d["topics"]) for d in skill["days"]) if skill else 0
    checked_count = len(progress.get(skill_id, []))
    pct      = round((checked_count / total) * 100) if total else 0

    return jsonify({"success": True, "completion": pct,
                    "checked_count": checked_count, "total": total})


@app.route("/api/reset/<skill_id>", methods=["POST"])
@login_required
def reset_progress(skill_id):
    uid = session["user_id"]
    db  = get_db()
    db.execute("DELETE FROM progress WHERE user_id=? AND skill_id=?", (uid, skill_id))
    db.commit()
    db.close()
    return jsonify({"success": True})


@app.route("/api/theme", methods=["POST"])
@login_required
def save_theme():
    data  = request.get_json()
    theme = data.get("theme", "light")
    if theme not in ("light", "dark", "auto"):
        return jsonify({"error": "Invalid theme"}), 400
    uid = session["user_id"]
    db  = get_db()
    db.execute("UPDATE users SET theme=? WHERE id=?", (theme, uid))
    db.commit()
    db.close()
    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(debug=True, port=8080)
