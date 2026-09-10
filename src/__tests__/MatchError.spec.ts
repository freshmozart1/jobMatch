import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MatchError from '@/pages/match/MatchError.vue';

describe('MatchError', () => {
    it('renders the icon, heading, message, and both recovery buttons', () => {
        const wrapper = mount(MatchError, {
            props: { message: 'Network unreachable' },
        });

        expect(wrapper.find('.match-error__icon svg').exists()).toBe(true);
        expect(wrapper.find('.match-error__title').text()).toBe(
            'Search failed',
        );
        expect(wrapper.find('.match-error__message').text()).toBe(
            'Network unreachable',
        );
        expect(wrapper.find('.match-error__message').attributes('role')).toBe(
            'alert',
        );
        expect(wrapper.find('.match-error__retry').text()).toBe('Try again');
        expect(wrapper.find('.match-error__search').text()).toBe('Edit search');
    });

    it('emits retry when the retry button is clicked', async () => {
        const wrapper = mount(MatchError, {
            props: { message: 'Network unreachable' },
        });

        await wrapper.find('.match-error__retry').trigger('click');

        expect(wrapper.emitted('retry')).toHaveLength(1);
    });

    it('emits open-search with the button element when the search button is clicked', async () => {
        const wrapper = mount(MatchError, {
            props: { message: 'Network unreachable' },
        });
        const button = wrapper.find('.match-error__search');

        await button.trigger('click');

        expect(wrapper.emitted('open-search')).toHaveLength(1);
        expect(wrapper.emitted('open-search')![0]).toEqual([button.element]);
    });

    it('exposes the Search dialog relationship and expanded state', async () => {
        const wrapper = mount(MatchError, {
            props: { message: 'Network unreachable' },
        });
        const button = wrapper.find('.match-error__search');

        expect(button.attributes('aria-haspopup')).toBe('dialog');
        expect(button.attributes('aria-controls')).toBe('search-dialog');
        expect(button.attributes('aria-expanded')).toBe('false');

        await wrapper.setProps({ searchOpen: true });
        expect(button.attributes('aria-expanded')).toBe('true');
    });
});
