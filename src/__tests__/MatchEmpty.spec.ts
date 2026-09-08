import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MatchEmpty from '@/pages/match/MatchEmpty.vue';

describe('MatchEmpty', () => {
    it('renders the icon, heading, body text, and CTA button', () => {
        const wrapper = mount(MatchEmpty);

        expect(wrapper.find('.match-empty__icon svg').exists()).toBe(true);
        expect(wrapper.find('.match-empty__title').text()).toBe(
            'No keywords yet',
        );
        expect(wrapper.find('.match-empty__text').text()).toBe(
            'Add search keywords to start swiping jobs.',
        );
        expect(wrapper.find('.match-empty__cta').text()).toBe('Add keywords');
    });

    it('emits open-search when the CTA button is clicked', async () => {
        const wrapper = mount(MatchEmpty);
        const button = wrapper.find('.match-empty__cta');

        await button.trigger('click');

        expect(wrapper.emitted('open-search')).toHaveLength(1);
        expect(wrapper.emitted('open-search')![0]).toEqual([button.element]);
    });

    it('exposes the Search dialog relationship and expanded state', async () => {
        const wrapper = mount(MatchEmpty);
        const button = wrapper.find('.match-empty__cta');

        expect(button.attributes('aria-haspopup')).toBe('dialog');
        expect(button.attributes('aria-controls')).toBe('search-dialog');
        expect(button.attributes('aria-expanded')).toBe('false');

        await wrapper.setProps({ searchOpen: true });
        expect(button.attributes('aria-expanded')).toBe('true');
    });
});
