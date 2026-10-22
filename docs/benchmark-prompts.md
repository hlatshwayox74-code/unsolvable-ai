# Benchmark prompts

Run each prompt with the same settings on every model that supports it, and record realism,
prompt adherence, product/person consistency, motion, text/logo accuracy, audio, time, cost and
whether it failed. The Library keeps model, settings, cost and status for every run.

1. **Cinematic human** — "Handheld medium shot of a woman in her thirties laughing as she ties her
   running shoes on a Gqeberha beachfront bench at sunrise, wind moving her hair, 35mm, shallow depth of field." (16:9, 8 s)
2. **Product ad from a photo** — image-to-video from a real product photo: "Slow orbit around the
   product on a black plinth, a single hard key light sweeping across it, dust in the air." (9:16, 5–8 s)
3. **Product in an environment** — text-to-video with the product photo as reference (Veo):
   "The suitcase rolls itself through a busy airport terminal, low tracking shot, reflections on the floor."
4. **Talking person** — Veo: "Close-up of a barber in his shop looking at camera; he says,
   \"Fresh cut, no appointment — walk in.\" Warm tungsten light, clippers buzzing." (16:9, 8 s)
5. **Vertical social ad** — "UGC-style selfie video, a young man unboxes a magnetic power bank and
   snaps it onto his phone, bright bedroom daylight." (9:16)
6. **Product-preserving edit** — GPT Image 2, edit with the product photo: "Place this exact bottle
   on wet black slate with water droplets; keep the label text and cap unchanged."
7. **Six instructions at once** — "A red vintage bicycle leaning on a yellow wall, a black cat asleep
   in its basket, three pigeons on the ground, late-afternoon light from the left, the word OPEN in a
   shop window behind, shot from a low angle."
