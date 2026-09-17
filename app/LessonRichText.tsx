"use client";

import { classifyLines } from "../apps/shared/lesson-presentation";

const lineClass = { lead: "is-lead", child: "is-child", bullet: "is-bullet", plain: "" } as const;

export default function LessonRichText({ value, className }: { value: string; className: string }) {
  return <div className={className}>
    {classifyLines(value).map((line, index) => <p className={lineClass[line.kind]} key={index}>{line.text}</p>)}
  </div>;
}
