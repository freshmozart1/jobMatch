import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CoverLetterAction from '@/components/coverLetter/CoverLetterAction.vue';

describe('CoverLetterAction', () => {
    describe('conditional text (done prop)', () => {
        it('shows "Write a tailored note" when not done', () => {
            const wrapper = mount(CoverLetterAction, {
                props: { done: false },
            });
            expect(wrapper.find('.cl-action__sub').text()).toBe(
                'Write a tailored note',
            );
        });

        it('shows "Draft written" when done', () => {
            const wrapper = mount(CoverLetterAction, { props: { done: true } });
            expect(wrapper.find('.cl-action__sub').text()).toBe(
                'Draft written',
            );
        });
    });

    describe('open action', () => {
        it('emits "click" when the row button is clicked', async () => {
            const wrapper = mount(CoverLetterAction, {
                props: { done: false },
            });
            await wrapper.find('.cl-action__row').trigger('click');
            expect(wrapper.emitted('click')).toBeTruthy();
        });
    });

    describe('download button', () => {
        it('is disabled when done is false', () => {
            const wrapper = mount(CoverLetterAction, {
                props: { done: false },
            });
            expect(
                (wrapper.find('.cl-action__dl').element as HTMLButtonElement)
                    .disabled,
            ).toBe(true);
        });

        it('is enabled when done is true', () => {
            const wrapper = mount(CoverLetterAction, { props: { done: true } });
            expect(
                (wrapper.find('.cl-action__dl').element as HTMLButtonElement)
                    .disabled,
            ).toBe(false);
        });

        it('emits "download" when clicked and done is true', async () => {
            const wrapper = mount(CoverLetterAction, { props: { done: true } });
            await wrapper.find('.cl-action__dl').trigger('click');
            expect(wrapper.emitted('download')).toBeTruthy();
        });

        it('does not emit "download" when the button is disabled', async () => {
            const wrapper = mount(CoverLetterAction, {
                props: { done: false },
            });
            await wrapper.find('.cl-action__dl').trigger('click');
            expect(wrapper.emitted('download')).toBeFalsy();
        });
    });
});
