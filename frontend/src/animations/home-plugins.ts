import { Draggable } from "gsap/Draggable";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";

import { gsap } from "./gsap";

// Only the homepage moves things along paths or by drag, so the dashboard skips this weight.
gsap.registerPlugin(Draggable, MotionPathPlugin);

export { Draggable };
