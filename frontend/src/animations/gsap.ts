import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// The only place plugins register, so no component does it twice.
gsap.registerPlugin(useGSAP, ScrollTrigger);
gsap.defaults({ ease: "power3.out", duration: 0.8 });

export { gsap, ScrollTrigger, useGSAP };
