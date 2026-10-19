import { boolean, color, range, select, text } from "../controls"
import { defineComponent } from "../define"
import { ShimmeringStatement } from "./shimmering-statement"

/**
 * The first component made editable: the registry's `ShimmeringText`.
 *
 * Chosen because it is a real shadcn-registry item (`registry.json` → `shimmering-text`, from
 * `@ncdai`), small enough to show the whole path, and has properties that are worth editing and
 * that visibly change what is on screen — which is what proves the controls are not decorative.
 *
 * What is declared editable is a *choice*, not a mirror of the component's props: the registry
 * component takes `text`, `duration` and `isStopped` (plus everything a `motion.span` takes —
 * `className`, `style`, event handlers, refs). Of those only the first three are offered, and
 * `isStopped` is offered inverted as `animate`. Size, alignment and the two colours are not
 * props of the registry component at all; they belong to `ShimmeringStatement`, which is where a
 * *use* of the component (as opposed to the component) is decided.
 */
const COLOR_TOKENS = ["foreground", "muted-foreground", "primary"] as const

export const shimmeringText = defineComponent({
  id: "shimmering-text",
  title: "Shimmering statement",
  description:
    "A line of text with a light that sweeps across it. For a headline or a one-line pitch.",
  category: "Text",
  version: 1,
  registry: { item: "shimmering-text" },

  props: {
    text: text({
      label: "Text",
      help: "One line reads best.",
      required: true,
      maxLength: 140,
      placeholder: "Building things that ship.",
      default: "Building things that ship.",
    }),
    size: select({
      label: "Size",
      options: [
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "xl", label: "Extra large" },
      ],
      default: "lg",
    }),
    align: select({
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
      ],
      default: "left",
    }),
    duration: range({
      label: "Sweep time",
      help: "How long the light takes to cross the text.",
      min: 0.4,
      max: 4,
      step: 0.1,
      unit: "s",
      default: 1.6,
    }),
    animate: boolean({
      label: "Animate",
      help: "Always off for visitors who have asked their system for reduced motion.",
      default: true,
    }),
    color: color({
      label: "Text colour",
      help: "Empty keeps the muted theme colour.",
      tokens: COLOR_TOKENS,
    }),
    shimmerColor: color({
      label: "Light colour",
      help: "Empty keeps the theme's foreground colour.",
      tokens: COLOR_TOKENS,
    }),
  },

  render: (props) => <ShimmeringStatement {...props} />,
})
