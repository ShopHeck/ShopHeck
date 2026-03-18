import type { Sport } from '../types';

export const REACTION_PROMPTS: Record<Sport | 'general', string[]> = {
  general: [
    "Prioritize head movement this round.",
    "Keep your hands sharp — straight punches, always returning to your chin.",
    "Use feints to close the distance and work the body this round.",
    "Looking great CHAMP! Embrace the suck!",
    "Stay on your toes and move with purpose.",
    "Breathe out on every strike. Relax your shoulders.",
    "Set up the jab — everything flows from the jab.",
    "Don't forget the body. Soften those ribs.",
    "Reset to the center after every exchange.",
    "Pressure is a weapon. Make them uncomfortable.",
    "You're built for this. Keep grinding.",
    "Stay disciplined. Stick to your game plan.",
    "Defense wins fights. Protect yourself at all times.",
    "Work in combinations — single shots are easy to read.",
    "Control the range. You dictate this fight.",
  ],

  Boxing: [
    "Prioritize head movement this round — slip and counter.",
    "Keep your hands sharp — straight punches, always returning to your chin.",
    "Use feints to close the distance and work the body this round.",
    "Looking great CHAMP! Embrace the suck!",
    "Double the jab — use it to find range and disrupt their rhythm.",
    "Roll under the right hand and come up with the left hook to the body.",
    "Pivot off the back foot after each combination. Don't stand in front of them.",
    "Jab to the body, jab to the head — keep them guessing.",
    "Stay behind your jab and make them reach for you.",
    "Left hook off the jab. Land it clean and reset.",
    "Watch the right hand counter — slip outside and fire back.",
    "You're winning. Stay smart, stay disciplined.",
    "Cut off the ring. Every step forward is intentional.",
    "Work the uppercut in close — you've been setting it up all round.",
    "Relax between shots. Tension kills speed.",
  ],

  MMA: [
    "Mix your levels — jab high, shoot low.",
    "Control the clinch and land dirty boxing to the body.",
    "Prioritize head movement — don't be a stationary target.",
    "Looking great CHAMP! Embrace the suck!",
    "Set up the takedown with your jab. Make them think hands first.",
    "If they sprawl, go to the body and clinch. Always have a plan B.",
    "Use feints to read their reaction before committing.",
    "Keep your wrestling active — threat of the takedown opens up the striking.",
    "Protect your neck in the clinch. Posture up.",
    "Stay disciplined on the feet. Don't brawl — you're better than that.",
    "Breathe. Relax. Trust your training.",
    "Pressure them against the cage and work your dirty boxing.",
    "Strike, move, don't stand still. Make them adjust to you.",
    "You're built for this. Keep grinding.",
    "Stay active with your guard — frame and create distance when needed.",
  ],

  'Muay Thai': [
    "Prioritize the teep this round — control distance with your lead leg.",
    "Set up the roundhouse with a jab. Land the kick clean.",
    "Use feints to close the distance and work the clinch this round.",
    "Looking great CHAMP! Embrace the suck!",
    "Sweep when they load their weight forward. Timing over power.",
    "Jab, cross, body kick. Repeat and reset.",
    "Work the clinch — knee to the body, break, reset to range.",
    "Switch kick off the jab. Catch them stepping in.",
    "Stay patient. The left kick will land when they get comfortable.",
    "Keep your guard tight after every kick. Don't drop your hands.",
    "You're winning the distance battle. Keep the teep working.",
    "Knee to the thigh in the clinch — break their base.",
    "Breathe out on every strike. Relax your shoulders.",
    "Make them think twice about coming forward.",
    "You're built for this. Keep grinding.",
  ],

  Kickboxing: [
    "Jab, cross, body kick — your bread and butter this round.",
    "Prioritize head movement — slip and counter with the left hook.",
    "Use feints to draw their guard and fire the roundhouse.",
    "Looking great CHAMP! Embrace the suck!",
    "Keep your lead hand up after every kick. Don't get caught.",
    "Step in behind the jab and land the right hand clean.",
    "Switch stance to confuse their timing, then punish them.",
    "Body kick to the liver — they'll feel that all fight long.",
    "Stay disciplined. Don't brawl — you're faster than them.",
    "Front kick to reset the distance when they pressure.",
    "Work the head kick off a body feint.",
    "Breathe. Relax. Trust your training.",
    "Combinations score points. Single shots don't win fights.",
    "You're built for this. Keep grinding.",
    "Stay light on your feet — movement creates opportunity.",
  ],

  Wrestling: [
    "Level change off the jab — make them respect your takedown.",
    "Snap their head down and go to work on the body.",
    "Looking great CHAMP! Embrace the suck!",
    "Control the underhook — whoever has inside position wins the exchange.",
    "Your scrambles are your best weapon. Stay aggressive on the mat.",
    "Drive through the takedown, don't just dive in.",
    "Whizzer hard and circle out when they shoot.",
    "Work the body lock against the wall — wear them down.",
    "Stay low, stay heavy. Make every shot count.",
    "You're physically stronger. Use it — make this fight exhausting for them.",
    "Breathe. Relax. Trust your training.",
    "Headlock to the mat — clean and simple.",
    "Two-on-one grip, pull the arm, go behind.",
    "You're built for this. Keep grinding.",
    "Stay active. Wrestling is about constant pressure.",
  ],

  BJJ: [
    "Prioritize posture — a broken posture is a finished fight.",
    "Work the guard pass systematically — don't rush it.",
    "Looking great CHAMP! Embrace the suck!",
    "Bait the triangle and stack through — turn it into your pass.",
    "Stay patient with the submission. If it's not there, take the position.",
    "Use your weight, not your strength. Stay heavy on top.",
    "Frame and shrimp. Create space every time they settle.",
    "The sweep sets up the submission. The submission sets up the sweep.",
    "Breathe. Relax. Tension is your enemy on the mat.",
    "Stay tight in side control — no space, no escape.",
    "Look for the back — it's the most dominant position in the game.",
    "Leg lock entry off the failed takedown — go right into the outside heel hook.",
    "You're built for this. Keep grinding.",
    "Guard retention — hips up, frames out, never flat.",
    "Trust your A-game. Stick to your game plan.",
  ],

  'Bare Knuckle': [
    "Slip the jab — make every punch miss and come back with the counter.",
    "Work the inside. Short hooks to the body, tight uppercuts. This is your range.",
    "Head movement is your armor. No gloves means every punch matters.",
    "Looking great CHAMP! Embrace the suck!",
    "Stay in your shell at range — don't give them a clean look.",
    "Dirty boxing time. Clinch, short shots, break clean.",
    "Counter off the slip — check hook when they come straight.",
    "Body work sets up the head. They can't protect everything.",
    "You're tougher than them. Make every 2-minute round a war.",
    "Tight guard, tight elbows — protect the nose and eyes.",
    "Make them reach. The puncher who reaches gets countered.",
    "Breathe. Relax. Tension kills speed — stay loose.",
    "Pressure relentlessly. No rest, no mercy. BKFC pace.",
    "You're built for this. Keep grinding.",
    "Every slip is a counter opportunity — don't waste it.",
  ],
};

export function getRandomPrompt(sport: Sport | undefined, isPro: boolean): string {
  const key = (isPro && sport && sport in REACTION_PROMPTS) ? sport : 'general';
  const prompts = REACTION_PROMPTS[key as keyof typeof REACTION_PROMPTS];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

// ─── Goggins-Mode Coaching Cues ───────────────────────────────────────────────

export const GOGGINS_CUES: string[] = [
  "You think this is hard? Good. Hard is what separates you from everyone else who quit.",
  "Forty percent. That's all you've given. You have sixty percent left. USE IT.",
  "Your mind is begging you to slow down. That is a lie. Keep going.",
  "Nobody is coming to save you. You have to save yourself. MOVE.",
  "Callus your mind. Every second of this discomfort is building something they can't take from you.",
  "When you think you're done, you're only at forty percent. You have more. Give it.",
  "Stay hard. This rest is over the moment you decide you're ready.",
  "You chose this. Own every second of it. No excuses.",
  "The most dangerous person in the world is someone who refuses to accept their limitations. Be that person.",
  "Pain is temporary. Weakness — if you let it in — is permanent. Don't let it in.",
  "Be uncommon amongst uncommon people. Go beyond what they think you're capable of.",
  "There's no cookie at the end of this. You do it because it makes you unbreakable.",
  "The only way out is through. Get back out there and take what's yours.",
  "Suffering is a gift. It reveals what you are made of. Let's find out.",
  "Your body is telling you to stop. Your body is a liar. Override it.",
  "Who's gonna carry the boats when it gets hard? YOU ARE. Now GO.",
  "Every rep, every round, every second is a war against the voice in your head saying quit. WIN THAT WAR.",
  "You didn't come this far to come this far. FINISH.",
  "I don't stop when I'm tired. I stop when I'm done. Are you done? I didn't think so.",
  "This moment right here — this is where champions are made. Not in the easy moments. THIS one.",
  "Take their soul. When that bell rings, take everything they have.",
  "You have to be willing to suffer more than your opponent. Are you willing? PROVE IT.",
  "No days off in your mind. Your mind must be trained harder than your body.",
  "The standard is the standard. Don't negotiate with yourself. Execute.",
];

export function getCoachingCue(sport: Sport | undefined, style: 'standard' | 'goggins'): string {
  if (style === 'goggins') {
    return GOGGINS_CUES[Math.floor(Math.random() * GOGGINS_CUES.length)];
  }
  return getRandomPrompt(sport, true);
}
