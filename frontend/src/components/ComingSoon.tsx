interface ComingSoonProps {
  title: string;
  description?: string;
  /** Compact block under a live feature (not a full-page stub). */
  embedded?: boolean;
}

export function ComingSoon({
  title,
  description,
  embedded = false,
}: ComingSoonProps) {
  const Heading = embedded ? "h2" : "h1";
  return (
    <section
      className={embedded ? "coming-soon coming-soon--embedded" : "coming-soon"}
      aria-labelledby="coming-soon-title"
    >
      <p className="eyebrow">Coming soon</p>
      <Heading
        id="coming-soon-title"
        className={embedded ? "h-sm" : "display"}
      >
        {title}
      </Heading>
      <p className={embedded ? "coming-soon__body" : "lede"}>
        {description ??
          "This part of Nirixon is not available yet. Your screening flow still works as usual."}
      </p>
    </section>
  );
}
