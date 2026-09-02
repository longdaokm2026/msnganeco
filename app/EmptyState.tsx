import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

function EmptyStateArtwork() {
  return (
    <svg className="empty-state-artwork" viewBox="0 0 240 150" role="img" aria-label="Minh họa lớp học">
      <path className="empty-art-blob" d="M53 31c22-25 66-24 91-10 18 10 31 4 48 18 24 19 29 65 7 87-18 19-48 11-73 12-30 1-63 12-83-10-22-23-10-73 10-97Z" />
      <rect className="empty-art-board" x="79" y="35" width="93" height="59" rx="6" />
      <path className="empty-art-line" d="M93 50h37M93 61h62M93 72h27" />
      <rect className="empty-art-accent" x="137" y="54" width="10" height="25" rx="2" />
      <rect className="empty-art-accent pale" x="151" y="45" width="10" height="34" rx="2" />
      <circle className="empty-art-person" cx="59" cy="83" r="13" />
      <path className="empty-art-person" d="M37 127v-18c0-14 9-23 22-23s22 9 22 23v18Z" />
      <circle className="empty-art-person light" cx="181" cy="91" r="12" />
      <path className="empty-art-person light" d="M162 127v-15c0-13 7-21 19-21s20 8 20 21v15Z" />
      <path className="empty-art-desk" d="M25 127h190M45 112h50v15M147 112h50v15" />
      <path className="empty-art-accent-stroke" d="m69 75 19-16M172 82l-15-17" />
      <circle className="empty-art-dot" cx="199" cy="42" r="5" />
      <circle className="empty-art-dot pale" cx="42" cy="49" r="4" />
    </svg>
  );
}

export default function EmptyState({ title, description, action, compact = false, className = "" }: Props) {
  return (
    <div className={`content-empty-state${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>
      <EmptyStateArtwork />
      <strong>{title}</strong>
      {description && <span>{description}</span>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
