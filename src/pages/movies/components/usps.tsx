import { Container } from "./container";
import { FadeIn } from "./fade-in";

export const Usps = () => {
  return (
    <Container className="relative z-10 max-w-[692px] space-y-12 py-32 text-3xl font-bold text-white font-apple md:text-4xl tracking-tight">
      <FadeIn>
        <p>New blockbuster movies every week — always in pristine quality.</p>
      </FadeIn>
      <FadeIn>
        <p>
          Stream on EetNet on your phone, tablet, browser, or smart TV.
        </p>
      </FadeIn>
      <FadeIn>
        <p>Watch in 4K HDR video with immersive cinematic audio.</p>
      </FadeIn>
      <FadeIn>
        <p>Unlimited access to the latest releases and all-time favorites.</p>
      </FadeIn>
    </Container>
  );
};
