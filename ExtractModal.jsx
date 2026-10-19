import { useState } from "react";
import Modal from "./Modal.jsx";

export default function ExtractModal({ count, onExtract, onLater }) {
  const [instructions, setInstructions] = useState("");
  return (
    <Modal title={count > 1 ? `${count} receipts uploaded` : "Receipt uploaded"} onClose={onLater}>
      <p>Do you want Ledgr to read {count > 1 ? "them" : "it"} and pull out the details now?</p>
      <label className="field-label">Anything specific? (optional)
        <textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Include the customer's phone number and delivery address" />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={onLater}>Later</button>
        <button className="btn btn-primary" onClick={() => onExtract(instructions)}>Extract information</button>
      </div>
    </Modal>
  );
}
