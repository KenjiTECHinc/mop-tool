interface AlertProps {
  title: string;
  body?: string;
}

export function Alert({ title, body }: AlertProps) {
  return (
    <div className="rounded-r-[8px] border-l-[3px] border-ink bg-paper px-4 py-3 text-sm" role="alert">
      <b className="block font-medium">{title}</b>
      {body ? <span>{body}</span> : null}
    </div>
  );
}
