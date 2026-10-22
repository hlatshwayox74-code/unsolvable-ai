const SECTIONS: { q: string; a: string[] }[] = [
  {
    q: "How does a generation work?",
    a: [
      "When you press Generate, the server checks your settings against what the model supports, works out the cost, and sends the job to the provider. Video jobs run on the provider's side and usually take 30 seconds to a few minutes; this page checks on them every few seconds.",
      "When a job finishes, the file is copied into your private storage, so the link never expires. If a job fails, the reason from the provider is shown on the card, and any reserved credits are returned.",
    ],
  },
  {
    q: "Why is there no progress percentage?",
    a: ["Only Runway reports progress. Veo, OpenAI and ElevenLabs don't, so for those you see the elapsed time instead of a made-up number."],
  },
  {
    q: "How do I keep my product looking right?",
    a: [
      "Use Ad Studio. It analyses your photo, lets you correct the description, and adds an accuracy instruction to every prompt. For video, \"Make from product photo\" starts the clip on your real photo, which is the most faithful option.",
      "AI models can still change small details such as label text. That's why headlines, prices and logos are drawn by the layout tool rather than the model, and why you can place your original cut-out over the scene untouched. Always check results before publishing.",
    ],
  },
  {
    q: "Can it make a person say my script?",
    a: [
      "Veo 3.1 generates speech and lip sync in the video itself: write the line in quotes in your prompt. It uses Veo's own voice, not an ElevenLabs voice.",
      "Matching a specific ElevenLabs voice to a person's lips needs a dedicated lip-sync model, which isn't connected yet. Until then, use the voiceover over product shots, or Veo dialogue for on-camera lines.",
    ],
  },
  {
    q: "Whose likeness and voice can I use?",
    a: ["Only your own, or someone who has given you permission. Don't upload photos of other people or clone voices without consent, and don't make ads that imply an endorsement that doesn't exist."],
  },
  {
    q: "What are the limits?",
    a: [
      "Uploads: images up to 4 MB (large photos are resized automatically), videos up to 4 MB and 30 seconds. Up to 4 generations running at once. Veo 1080p, 4K and reference images need 8-second clips.",
      "Ad video: shots are made one at a time so you can redo any single shot. The preview plays them in order with the voiceover; export the shots and voiceover separately to cut them together.",
    ],
  },
  {
    q: "What does it cost?",
    a: ["Every Generate button shows the estimated provider cost before you press it. Prices come from each provider's published rates (October 2026). OpenAI images and ElevenLabs depend on your plan, so those are labelled as estimates."],
  },
]

export default function Help() {
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="display text-5xl">Help</h1>
      {SECTIONS.map((s) => (
        <section key={s.q} className="space-y-2 border-t border-line pt-5">
          <h2 className="text-lg font-semibold">{s.q}</h2>
          {s.a.map((p) => <p key={p} className="leading-relaxed text-mist">{p}</p>)}
        </section>
      ))}
    </div>
  )
}
