import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api";
import type { AskResponse } from "../lib/api";

interface Props {
  documentId: string | null;
}

interface Message {
  role:     "user" | "assistant";
  content:  string;
  sources?: AskResponse["sources"];
}

const HINTS = [
  "What is the submission deadline?",
  "Who is the contracting authority?",
  "What are the eligibility requirements?",
  "List all procurement lots and values.",
];

export function QAPanel({ documentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);

  // Reset on document change
  useEffect(() => { setMessages([]); setInput(""); }, [documentId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(question: string) {
    if (!question.trim() || !documentId || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await api.ask(documentId, question);
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (e) {
      setMessages((m) => [...m, {
        role: "assistant",
        content: `Error: ${(e as Error).message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const disabled = !documentId || loading;

  return (
    <aside className="qa-panel">
      <div className="qa-header">
        <div className="qa-title">Query document</div>
      </div>

      <div className="qa-messages" ref={messagesRef}>

        {/* Empty state with hints */}
        {messages.length === 0 && !loading && (
          <div className="qa-empty">
            <span className="qa-empty-label">Ask anything</span>
            <div className="qa-empty-hints">
              {HINTS.map((h) => (
                <button
                  key={h}
                  className="qa-hint"
                  disabled={disabled}
                  onClick={() => send(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Thinking indicator */}
        {loading && (
          <div className="msg assistant">
            <div className="msg-role">patterno</div>
            <div className="msg-body" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
              <span className="spinner" />
              <span style={{ fontFamily: "var(--mono)", fontSize: "11px" }}>
                retrieving · reranking · generating
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="qa-input-row">
        <textarea
          ref={inputRef}
          className="qa-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
          }}
          onKeyDown={handleKeyDown}
          placeholder={documentId ? "Ask about this document…" : "Select a document first"}
          disabled={disabled}
          rows={1}
        />
        <button
          className="qa-send"
          disabled={disabled || !input.trim()}
          onClick={() => send(input)}
          aria-label="Send"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7h12M7 1l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </aside>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <div className={`msg ${message.role}`}>
      <div className="msg-role">{message.role === "user" ? "you" : "patterno"}</div>
      <div className="msg-body">{message.content}</div>

      {message.sources && message.sources.length > 0 && (
        <>
          <button
            className="sources-toggle"
            onClick={() => setSourcesOpen((o) => !o)}
          >
            {sourcesOpen ? "▾" : "▸"} {message.sources.length} source{message.sources.length > 1 ? "s" : ""}
          </button>
          {sourcesOpen && (
            <div className="sources-list open">
              {message.sources.map((s, i) => (
                <div key={i} className="source-item">
                  <div className="source-score">
                    rerank {s.rerankScore != null ? s.rerankScore.toFixed(3) : "—"}
                    {" · "}
                    hybrid {s.hybridScore.toFixed(3)}
                  </div>
                  {s.content.slice(0, 160)}…
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
