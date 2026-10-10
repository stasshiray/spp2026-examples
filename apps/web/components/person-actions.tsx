import { useState } from "react";
import { blockProfile, describeApiError, reportProfile } from "../lib/api";

export function PersonActions({
  token,
  profileId,
  onBlocked,
}: {
  token: string;
  profileId: number;
  onBlocked?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function block() {
    setPending(true);
    setMessage(null);

    try {
      await blockProfile(token, profileId);
      onBlocked?.();
    } catch (error: unknown) {
      setMessage(describeApiError(error));
    } finally {
      setPending(false);
    }
  }

  async function report() {
    if (reason.trim() === "") {
      setMessage("Напишите, что случилось");

      return;
    }

    setPending(true);
    setMessage(null);

    try {
      await reportProfile(token, profileId, reason.trim());
      setReason("");
      setMessage("Жалоба отправлена");
    } catch (error: unknown) {
      setMessage(describeApiError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="safety">
      <button type="button" className="skip" disabled={pending} onClick={() => void block()}>
        Скрыть
      </button>
      <label className="note">
        <span>Жалоба</span>
        <input
          value={reason}
          maxLength={500}
          placeholder="Что не так"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <button type="button" className="skip" disabled={pending} onClick={() => void report()}>
        Пожаловаться
      </button>
      {message ? <p className="status">{message}</p> : null}
    </div>
  );
}
