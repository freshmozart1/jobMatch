import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import { LikeContainer } from '@/components';
import {
    APPLICATION_EDITOR_DIALOG_ID,
    APPLICATION_EDITOR_NAME,
} from '@/components/application';

describe('LikeContainer', () => {
    it('renders a dislike, edit, and like control', () => {
        const wrapper = mount(LikeContainer);

        expect(wrapper.find('.like-container__button--dislike').exists()).toBe(
            true,
        );
        expect(wrapper.find('.like-container__button--edit').exists()).toBe(
            true,
        );
        expect(wrapper.find('.like-container__button--like').exists()).toBe(
            true,
        );
    });

    it('exposes accessible labels for all three controls', () => {
        const wrapper = mount(LikeContainer);

        const labels = wrapper
            .findAll('.like-container__button')
            .map((button) => button.attributes('aria-label'));
        expect(labels).toEqual([
            'Dislike',
            `Open ${APPLICATION_EDITOR_NAME}`,
            'Like',
        ]);
    });

    it('identifies the edit control as a collapsed dialog launcher by default', () => {
        const wrapper = mount(LikeContainer);
        const editButton = wrapper.find('.like-container__button--edit');

        expect(editButton.attributes('aria-haspopup')).toBe('dialog');
        expect(editButton.attributes('aria-controls')).toBe(
            APPLICATION_EDITOR_DIALOG_ID,
        );
        expect(editButton.attributes('aria-expanded')).toBe('false');
    });

    it('reports the Application Editor as expanded while it is open', () => {
        const wrapper = mount(LikeContainer, {
            props: { applicationEditorOpen: true },
        });

        expect(
            wrapper
                .find('.like-container__button--edit')
                .attributes('aria-expanded'),
        ).toBe('true');
    });

    it('defaults both thumb controls to 0.33 opacity', () => {
        const wrapper = mount(LikeContainer);

        expect(
            wrapper
                .find('.like-container__button--dislike')
                .attributes('style'),
        ).toContain('opacity: 0.33');
        expect(
            wrapper.find('.like-container__button--like').attributes('style'),
        ).toContain('opacity: 0.33');
    });

    it('applies the provided opacity values to the matching controls', () => {
        const wrapper = mount(LikeContainer, {
            props: { likeOpacity: 1, dislikeOpacity: 0 },
        });

        expect(
            wrapper.find('.like-container__button--like').attributes('style'),
        ).toContain('opacity: 1');
        expect(
            wrapper
                .find('.like-container__button--dislike')
                .attributes('style'),
        ).toContain('opacity: 0');
    });

    it('renders a stable positioning root for mobile layouts', () => {
        const wrapper = mount(LikeContainer);

        expect(wrapper.find('.like-container').exists()).toBe(true);
        expect(wrapper.findAll('.like-container__button')).toHaveLength(3);
    });

    it('emits an edit event when the pencil button is clicked', async () => {
        const wrapper = mount(LikeContainer);
        const editButton = wrapper.find('.like-container__button--edit');

        await editButton.trigger('click');

        expect(wrapper.emitted('edit')).toHaveLength(1);
        expect(wrapper.emitted('edit')![0]).toEqual([editButton.element]);
    });
});
