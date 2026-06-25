import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import JobCardCosineSimilarity from "@/components/jobCard/JobCardCosineSimilarity.vue";

const indicator = '[data-testid="matchIndicator"]';

describe("JobCardCosineSimilarity", () => {
  describe("isValid guard", () => {
    it("does not render when value is NaN", () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: NaN } });
      expect(wrapper.find(indicator).exists()).toBe(false);
    });

    it("renders when value is a valid number", () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 0.5 } });
      expect(wrapper.find(indicator).exists()).toBe(true);
    });
  });

  describe("clamped value (aria-valuenow)", () => {
    it("clamps -0.5 to 0", () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: -0.5 },
      });
      expect(wrapper.find(indicator).attributes("aria-valuenow")).toBe("0");
    });

    it("clamps 1.5 to 1", () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 1.5 } });
      expect(wrapper.find(indicator).attributes("aria-valuenow")).toBe("1");
    });

    it("keeps an in-range value unchanged", () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.75 },
      });
      expect(wrapper.find(indicator).attributes("aria-valuenow")).toBe("0.75");
    });
  });

  describe("percent display", () => {
    it("rounds 0.004 down to 0%", () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.004 },
      });
      expect(wrapper.find(".cosine-indicator__value").text()).toBe("0%");
    });

    it("rounds 0.005 up to 1%", () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.005 },
      });
      expect(wrapper.find(".cosine-indicator__value").text()).toBe("1%");
    });

    it("rounds 0.874 to 87%", () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.874 },
      });
      expect(wrapper.find(".cosine-indicator__value").text()).toBe("87%");
    });
  });

  describe("matchLevel labels", () => {
    it('shows "poor match" for values below 0.25', () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 0 } });
      expect(wrapper.find(indicator).attributes("aria-valuetext")).toContain(
        "poor match",
      );
    });

    it('shows "weak match" at exactly 0.25', () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.25 },
      });
      expect(wrapper.find(indicator).attributes("aria-valuetext")).toContain(
        "weak match",
      );
    });

    it('shows "moderate match" at exactly 0.5', () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 0.5 } });
      expect(wrapper.find(indicator).attributes("aria-valuetext")).toContain(
        "moderate match",
      );
    });

    it('shows "strong match" at exactly 0.75', () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.75 },
      });
      expect(wrapper.find(indicator).attributes("aria-valuetext")).toContain(
        "strong match",
      );
    });

    it('shows "strong match" at 1.0', () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 1 } });
      expect(wrapper.find(indicator).attributes("aria-valuetext")).toContain(
        "strong match",
      );
    });
  });

  describe("ARIA attributes", () => {
    it('has role="meter"', () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 0.5 } });
      expect(wrapper.find(indicator).attributes("role")).toBe("meter");
    });

    it("aria-valuetext contains the percentage and level label", () => {
      const wrapper = mount(JobCardCosineSimilarity, {
        props: { value: 0.87 },
      });
      const text = wrapper.find(indicator).attributes("aria-valuetext") ?? "";
      expect(text).toContain("87%");
      expect(text).toContain("strong match");
    });
  });

  describe("fillColor", () => {
    it("produces an oklch() color string", () => {
      const wrapper = mount(JobCardCosineSimilarity, { props: { value: 0.5 } });
      expect(
        wrapper.find(".cosine-indicator__fill").attributes("style"),
      ).toContain("oklch(");
    });

    it("produces different colors at 0 and 1 (hue interpolates)", () => {
      const low = mount(JobCardCosineSimilarity, { props: { value: 0 } });
      const high = mount(JobCardCosineSimilarity, { props: { value: 1 } });
      const styleLow =
        low.find(".cosine-indicator__fill").attributes("style") ?? "";
      const styleHigh =
        high.find(".cosine-indicator__fill").attributes("style") ?? "";
      expect(styleLow).not.toBe(styleHigh);
    });
  });
});
