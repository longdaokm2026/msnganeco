export type ListeningTranscriptVisibility = "NEVER" | "AFTER_SUBMIT";

export type ListeningTrack = {
  id: string;
  assignmentId?: string;
  title: string;
  instructions: string | null;
  transcript?: string | null;
  transcriptVisibility: ListeningTranscriptVisibility;
  maxPlayCount: number | null;
  allowSeeking: boolean;
  position: number;
  audioReady?: boolean;
  audioAttachment?: { id: string; fileName: string; fileType: string; fileSize: number; audioUrl: string } | null;
  questionCount: number;
  playCount?: number;
};

export type ListeningQuestion = {
  id: string;
  passageId: string | null;
  listeningTrackId: string | null;
  type: string;
  section: string;
  position: number;
  prompt: string;
  points: number;
  required: boolean;
  explanation?: string | null;
  config: Record<string, unknown>;
};
