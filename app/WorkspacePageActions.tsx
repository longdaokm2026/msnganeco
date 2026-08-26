"use client";

export default function WorkspacePageActions({ onBack }: { onBack: () => void }) {
  return <div className="workspace-page-actions">
    <button className="back-button" type="button" onClick={onBack}>← Back</button>
  </div>;
}
