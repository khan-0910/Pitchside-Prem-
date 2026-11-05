import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// The only place plugins register, so no component does it twice.
gsap.registerPlugin(useGSAP, ScrollTrigger, MotionPathPlugin, Draggable);
gsap.defaults({ ease: "power3.out", duration: 0.8 });

export { Draggable, gsap, MotionPathPlugin, ScrollTrigger, useGSAP };
