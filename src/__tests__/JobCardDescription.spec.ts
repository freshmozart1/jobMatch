import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import JobCardDescription from '@/components/jobCard/JobCardDescription.vue';

describe('JobCardDescription', () => {
    describe('conditional rendering', () => {
        it('does not render when descriptionText is undefined', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: undefined },
            });
            expect(wrapper.find('.job-card__description-frame').exists()).toBe(
                false,
            );
        });

        it('does not render when descriptionText is an empty string', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: '' },
            });
            expect(wrapper.find('.job-card__description-frame').exists()).toBe(
                false,
            );
        });

        it('renders when descriptionText is provided', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: 'Some text' },
            });
            expect(wrapper.find('.job-card__description-frame').exists()).toBe(
                true,
            );
        });
    });

    describe('parseDescription', () => {
        it('renders plain text without any <strong> elements', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: 'Plain text' },
            });
            expect(wrapper.find('.job-card__description strong').exists()).toBe(
                false,
            );
            expect(wrapper.find('.job-card__description').text()).toBe(
                'Plain text',
            );
        });

        it('wraps **word** in a <strong> element', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: 'Hello **world**!' },
            });
            expect(wrapper.find('.job-card__description strong').text()).toBe(
                'world',
            );
            expect(wrapper.find('.job-card__description').text()).toBe(
                'Hello world!',
            );
        });

        it('handles multiple bold segments', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: '**A** and **B**' },
            });
            const strongs = wrapper.findAll('.job-card__description strong');
            // fallow-ignore-next-line code-duplication
            expect(strongs).toHaveLength(2);
            expect(strongs[0]!.text()).toBe('A');
            expect(strongs[1]!.text()).toBe('B');
        });

        it('handles bold at the start of text', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: '**Bold** at start' },
            });
            expect(wrapper.find('.job-card__description strong').text()).toBe(
                'Bold',
            );
            expect(wrapper.find('.job-card__description').text()).toBe(
                'Bold at start',
            );
        });

        it('handles bold at the end of text', () => {
            const wrapper = mount(JobCardDescription, {
                props: { descriptionText: 'End is **Bold**' },
            });
            expect(wrapper.find('.job-card__description strong').text()).toBe(
                'Bold',
            );
            expect(wrapper.find('.job-card__description').text()).toBe(
                'End is Bold',
            );
        });

        it('preserves multiline bold, unmatched delimiters, and HTML as text', () => {
            const wrapper = mount(JobCardDescription, {
                props: {
                    descriptionText:
                        '<img src=x> **Bold\n<strong>text</strong>** end **unmatched',
                },
            });
            const description = wrapper.find('.job-card__description');
            expect(description.text()).toBe(
                '<img src=x> Bold\n<strong>text</strong> end **unmatched',
            );
            expect(description.find('strong').text()).toBe(
                'Bold\n<strong>text</strong>',
            );
            expect(description.find('img').exists()).toBe(false);
            expect(description.findAll('strong')).toHaveLength(1);
        });
    });
});
