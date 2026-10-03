import { Play } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { Button } from "../../../shared/components/button";
import { reviewArtwork } from "../../anime/mock/anime-mock";

const textVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      delay,
      ease: "easeOut",
    },
  }),
};

export function StaffPick({ onOpen }: { onOpen?: () => void }) {
  return (
    <section className="relative overflow-hidden border-y border-ink-700 bg-ink-900 py-16 sm:py-24">
      <img
        className="absolute inset-0 h-full w-full object-cover object-[70%_center] opacity-45"
        src={reviewArtwork}
        alt="Staff Pick featured anime"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/95 to-ink-950/30" />

      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-8 lg:px-12">
        <div className="max-w-xl">
          <motion.p
            className="font-body text-xs font-medium uppercase tracking-[0.16em] text-gold-500"
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            custom={0}
            viewport={{ once: true, margin: "-80px" }}
          >
            Editorial Staff Pick
          </motion.p>

          <motion.h2
            className="mt-3 font-display text-[39px] leading-[41px] tracking-display text-paper-100 sm:text-[49px] sm:leading-[51px]"
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            custom={0.1}
            viewport={{ once: true, margin: "-80px" }}
          >
            The City Across the Strait
          </motion.h2>

          <motion.p
            className="mt-4 font-body text-base leading-6 text-fog-500"
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            custom={0.2}
            viewport={{ once: true, margin: "-80px" }}
          >
            An astonishing, poetic exploration of memory and migration along a
            forgotten railway network.
          </motion.p>

          <motion.div
            className="mt-6 flex items-center gap-4"
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            custom={0.32}
            viewport={{ once: true, margin: "-80px" }}
          >
            <Button onClick={onOpen}>
              <Play size={16} fill="currentColor" />
              Watch now
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
