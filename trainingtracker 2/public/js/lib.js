/* Built-in exercise library used when searching/adding exercises */
const LIB=`Barbell Bench Press|Incline Barbell Bench Press|Decline Barbell Bench Press|Dumbbell Bench Press|Incline Dumbbell Press|Decline Dumbbell Press|Smith Machine Bench Press|Smith Machine Incline Bench Press|Machine Chest Press|Incline Machine Press|Cable Fly|Low-to-High Cable Fly|High-to-Low Cable Fly|Dumbbell Fly|Machine Fly (Pec Deck)|Push-Up|Weighted Push-Up|Dip|Weighted Dip|Machine Dip|Landmine Press|Svend Press|
Deadlift|Romanian Deadlift|Stiff-Leg Deadlift|Sumo Deadlift|Trap Bar Deadlift|Rack Pull|Barbell Row|Pendlay Row|Dumbbell Row|Chest-Supported Row|T-Bar Row|Seated Cable Row|Machine Row|Meadows Row|Seal Row|Pull-Up|Weighted Pull-Up|Chin-Up|Weighted Chin-Up|Assisted Pull-Up|Lat Pulldown|Close-Grip Lat Pulldown|Single-Arm Lat Pulldown|Straight-Arm Pulldown|Pullover Machine|Dumbbell Pullover|Back Extension|Good Morning|Inverted Row|Barbell Shrug|Dumbbell Shrug|Machine Shrug|
Overhead Press|Seated Barbell Press|Seated Dumbbell Shoulder Press|Arnold Press|Machine Shoulder Press|Smith Machine Shoulder Press|Push Press|Lateral Raise|Cable Lateral Raise|Machine Lateral Raise|Lean-Away Lateral Raise|Front Raise|Rear Delt Fly|Rear Delt Fly Machine|Reverse Cable Fly|Face Pull|Upright Row|Y-Raise|
Barbell Curl|EZ-Bar Curl|Dumbbell Curl|Hammer Curl|Cross-Body Hammer Curl|Incline Dumbbell Curl|Preacher Curl|Machine Preacher Curl|Cable Curl|Bayesian Cable Curl|Spider Curl|Concentration Curl|Reverse Grip Curl|Drag Curl|
Tricep Pushdown (Bar)|Tricep Pushdown (Rope)|Cable Rope Overhead Tricep Extension|Overhead Dumbbell Extension|Skull Crusher|EZ-Bar Skull Crusher|Close-Grip Bench Press|JM Press|Dumbbell Kickback|Single-Arm Cable Extension|Machine Tricep Extension|Bench Dip|
Wrist Curl|Reverse Wrist Curl|Behind-the-Back Wrist Curl|Farmer's Walk|Plate Pinch|Dead Hang|Wrist Roller|
Back Squat|Front Squat|Box Squat|Goblet Squat|Hack Squat|Smith Machine Squat|Pendulum Squat|Belt Squat|Leg Press|Single-Leg Press|Bulgarian Split Squat|Walking Lunge|Reverse Lunge|Barbell Lunge|Step-Up|Leg Extension|Lying Leg Curl|Seated Leg Curl|Nordic Curl|Hip Thrust|Glute Bridge|Cable Kickback|Hip Abduction Machine|Hip Adduction Machine|Standing Calf Raise|Seated Calf Raise|Leg Press Calf Raise|Tibialis Raise|Pistol Squat|Wall Sit|
Plank|Side Plank|Hanging Leg Raise|Hanging Knee Raise|Cable Crunch|Abdominal Crunch Machine|Crunch|Sit-Up|Decline Sit-Up|Ab Wheel Rollout|Russian Twist|Pallof Press|Dragon Flag|L-Sit|Dead Bug|Cable Woodchopper|
Power Clean|Hang Clean|Clean and Jerk|Snatch|Kettlebell Swing|Turkish Get-Up|Box Jump|Sled Push|Sled Pull|Medicine Ball Slam|Muscle-Up|Neck Curl|Neck Extension|
Running|Treadmill Run|Cycling|Rowing Machine|Assault Bike|Ski Erg|Stair Climber|Jump Rope|Swimming|Walking|Elliptical|Shadow Boxing|Heavy Bag|Pad Work`.split(/\|\s*/).map(s=>s.trim()).filter(Boolean);

const LIB_CARDIO=new Set(['Running','Treadmill Run','Cycling','Rowing Machine','Assault Bike','Ski Erg','Stair Climber','Swimming','Walking','Elliptical','Sled Push','Sled Pull']);
const LIB_TIMED=new Set(['Plank','Side Plank','Dead Hang','L-Sit','Wall Sit','Jump Rope','Shadow Boxing','Heavy Bag','Pad Work']);
function metricsFor(name){
  if(LIB_CARDIO.has(name)) return {duration:true,distance:true};
  if(LIB_TIMED.has(name)) return {duration:true};
  if(name==="Farmer's Walk") return {weight:true,distance:true};
  return {reps:true,weight:true};
}
