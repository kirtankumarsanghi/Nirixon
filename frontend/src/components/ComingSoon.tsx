interface ComingSoonProps {
  title: string;
  description?: string;
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <section className="coming-soon" aria-labelledby="coming-soon-title">
      <p className="eyebrow">Coming soon</p>
      <h1 id="coming-soon-title" className="display">
        {title}
      </h1>
      <p className="lede">
        {description ??
          "This part of Nirixon is not available yet. Your screening flow still works as usual."}
      </p>
    </section>
  );
}
