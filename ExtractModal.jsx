import { useState } from "react";
import Modal from "./Modal.jsx";

export default function ExtractModal({ count, onExtract, onLater }) {
  const [instructions, setInstructions] = useState("");
  return (
    <Modal title={count > 1 ? count + " records uploaded" : "Record uploaded"} onClose={onLater}>
      <p>Ledgr will copy every entry exactly as written, with the same titles and columns. Extract {count > 1 ? "them" : "it"} now?</p>
      <label className="field-label">Any changes? (optional)
        <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Only include the Name and Amount columns" />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onLater}>Later</button>
        <button className="btn btn-primary" onClick={() => onExtract(instructions)}>Extract information</button>
      </div>
    </Modal>
  );
}
