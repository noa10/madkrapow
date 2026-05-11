"use client";

export function HalalCommitmentSection() {
  return (
    <section id="halal_commitment" className="relative px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
      <div className="container mx-auto max-w-4xl">
        <div className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 backdrop-blur-sm sm:p-10 text-center">
          <h2 className="font-display text-2xl leading-tight text-white sm:text-3xl lg:text-4xl">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#f1d7aa] to-[#c59661]">
              Halal Ingredients You Can Trust
            </span>
          </h2>
          <p className="mt-5 text-base leading-7 text-[#d8d1c6] sm:text-lg sm:leading-8">
            We do not serve pork or alcohol, ever. Our chicken, beef and seafood are sourced from halal-certified local suppliers. We use Thai holy basil, fresh garlic, bird&apos;s eye chili and halal-certified fish sauce. Prepared in a pork-free kitchen.
          </p>
        </div>
      </div>
    </section>
  );
}
