import React, { Children, PureComponent } from 'react'
import PropTypes from 'prop-types'

import { addSubscriber, removeSubscriber } from '../lib/contextSubscribe'

import {
    getArray,
    getChecked,
    getDisabled, getEnabled,
    getIndex,
    isShallowlyDifferent,
    isShallowlyDifferentArray,
} from '../lib/state'

let tabbordionInstances = 0
let tabbordionUniqId = 0

function getStateBem(props) {
    return {
        bemModifiers: props.bemModifiers,
        bemSeparator: props.bemSeparator,
        blockElements: props.blockElements,
    }
}

function getStateTabbordion(context, props, state) {
    const panels = getArray(state.stateful ? state.panels : props.panels)

    //panels can be checked only when they are enabled
    return {
        animateContent: props.animateContent,
        checkedPanels: panels.filter(getChecked).filter(getEnabled).map(getIndex),
        disabledPanels: panels.filter(getDisabled).map(getIndex),
        firstVisiblePanel: context.firstVisibleIndex,
        lastVisiblePanel: context.lastVisibleIndex,
        firstSelectableIndex: context.firstSelectableIndex,
        panelName: props.name || context.uniqId,
        panelType: props.mode === 'multiple' ? 'checkbox' : 'radio',
        tabbordionId: props.id || context.uniqId,
    }
}

function identity(value) {
    return value
}

class Tabbordion extends PureComponent {
    constructor(props) {
        super(props)

        tabbordionInstances++
        this.uniqId = `tabbordion-${tabbordionUniqId}`
        tabbordionUniqId++

        this.getNextState = this.getNextState.bind(this)
        this.onChange = this.onChange.bind(this)

        this.firstVisibleIndex = null
        this.lastVisibleIndex = null
        this.firstSelectableIndex = null

        // panels always overrides initialPanels
        this.state = this.getNextState(
            props,
            { stateful: false },
            Array.isArray(props.panels) ? props.panels : props.initialPanels
        )

        // context subscribers
        this.subscribers = {
            bem: [],
            tabbordion: [],
        }

        this.childContext = {
            bem: {
                getState: () => this.bemState,
                subscribe: addSubscriber(this.subscribers.bem),
                unsubscribe: removeSubscriber(this.subscribers.bem),
            },
            tabbordion: {
                getState: () => this.tabbordionState,
                onChangePanel: this.onChange,
                subscribe: addSubscriber(this.subscribers.tabbordion),
                unsubscribe: removeSubscriber(this.subscribers.tabbordion),
            },
        }

        this.bemState = getStateBem(props)
        this.tabbordionState = getStateTabbordion(this, props, this.state)
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
        const nextState = this.getNextState(nextProps, this.state)
        // only update if there were changes to the local component state
        if (nextState !== this.state) {
            this.setState(nextState)
        }

        const bemState = getStateBem(nextProps)

        if (isShallowlyDifferent(bemState, this.bemState)) {
            this.subscribers.bem.forEach(component => component.forceUpdate())
            this.bemState = bemState
        }

        const tabbordionState = getStateTabbordion(this, nextProps, nextState)

        if (isShallowlyDifferent(tabbordionState, this.tabbordionState)) {
            this.subscribers.tabbordion.forEach(component => component.forceUpdate())
            this.tabbordionState = tabbordionState
        }
    }

    componentWillUnmount() {
        tabbordionInstances--
        if (tabbordionInstances === 0) tabbordionUniqId = 0
    }

    getChildContext() {
        return this.childContext
    }

    /*
     * Controls props and does those nasty little staties we kills them My Precious, *gollum* *gollum*
     * @param {object} props Props received by the component
     * @param {object} prevState State contained in the component
     * @param {array} initialPanels Initial panels state when component is mounted as a stateful component
     * @return {object} State to be used by the component
     */
    getNextState(props, prevState, initialPanels) {
        const panels = getArray(prevState.stateful ? prevState.panels : initialPanels || props.panels)
        const panelProps = []
        const usedIndexes = []
        const invalidIndexes = []

        const allowMultiChecked = props.mode === 'multiple'
        // fragments force us to do some recursive looping to find our actual children as React.Children does not do it
        const childPool = [props.children]
        // this logic probably needs to be refactored so that panels register to tabbordion
        while (childPool.length) {
            Children.forEach(childPool.shift(), child => {
                if (child == null || !child.type) {
                    return
                }

                const props = child.props || (child._store && child._store.props) || {}

                if (child.type === React.Fragment && props.children) {
                    childPool.push(props.children)
                } else if (child.type.contextTypes && child.type.contextTypes.tabbordion) {
                    // use false to mark panels with invalid index
                    const index = props.index != null ? props.index : false
                    // missing index and duplicates are invalid
                    const isInvalidIndex = index === false || usedIndexes.includes(index)

                    if (isInvalidIndex) {
                        invalidIndexes.push(panelProps.length)
                    } else {
                        usedIndexes.push(index)
                    }

                    panelProps.push({
                        checked: props.checked,
                        disabled: props.disabled,
                        index: isInvalidIndex ? false : index,
                        visible: props.visible,
                    })
                }
            })
        }

        // time to fix invalid index values
        let unusedIndex = 0

        while (invalidIndexes.length > 0) {
            // find the next usable index value
            while (usedIndexes.includes(unusedIndex)) {
                unusedIndex++
            }
            // use the index value
            panelProps[invalidIndexes.shift()].index = unusedIndex
            // try another index on the next round
            unusedIndex++
        }

        // now that we know the indexes we can link to existing data; if it happens to exist, of course
        let checkedCount = 0
        let firstVisibleIndex = null
        let lastVisibleIndex = null
        let firstSelectableIndex = null

        const nextPanels = panelProps.map((props, index) => {
            const panel = panels.find(panel => panel.index === props.index) || { checked, disabled, visible }

            const disabled = props.disabled != null ? props.disabled : !!panel.disabled

            //panel can be checked only when it is enabled
            const checked = !disabled && ((
                props.checked != null ? props.checked : !!panel.checked
            ) && (allowMultiChecked || checkedCount === 0))

            const visible = props.visible != null ? props.visible : (panel.visible === false ? false : true)

            if (visible) {
                lastVisibleIndex = index
                if (!disabled && firstSelectableIndex == null) firstSelectableIndex = lastVisibleIndex
                if (firstVisibleIndex == null) firstVisibleIndex = lastVisibleIndex
            }

            if (checked && visible) checkedCount++

            return {
                checked,
                disabled,
                index: props.index,
                visible,
            }
        })

        if (firstSelectableIndex != null) {
            // one panel must always be checked in single mode
            if (checkedCount === 0 && props.mode !== 'multiple' && props.mode !== 'toggle') {
                nextPanels[firstSelectableIndex].checked = true
            }
            // it is now safe to use the actual indexes instead of references
            firstVisibleIndex = nextPanels[firstVisibleIndex].index
            lastVisibleIndex = nextPanels[lastVisibleIndex].index
            firstSelectableIndex = nextPanels[firstSelectableIndex].index
        }

        // keep in local state: We can do this in this way because these values are derived from main panels state.
        //                      Also, this state is updated each time props change, thus we maintain "pureness".
        this.firstVisibleIndex = firstVisibleIndex
        this.lastVisibleIndex = lastVisibleIndex
        this.firstSelectableIndex = firstSelectableIndex

        // determine who will own the state
        const stateful = !props.onChange || !props.onPanels || !Array.isArray(props.panels)

        if (stateful) {
            // it is mine, my own, My Preciouss...
            if (!prevState.stateful || isShallowlyDifferentArray(prevState.panels, nextPanels)) {
                if (props.onPanels) props.onPanels(nextPanels)

                return {
                    panels: nextPanels,
                    stateful,
                }
            }
        } else {
            // provide updated state to whomever will own it
            if (isShallowlyDifferentArray(panels, nextPanels)) {
                props.onPanels(nextPanels)
            }
            // clear local state
            if (prevState.stateful) {
                return { panels: null, stateful }
            }
        }

        return prevState
    }

    onChange(index) {
        const { mode } = this.props

        if (!this.state.stateful) {
            this.props.onChange({
                index,
                mode,
            })
            return
        }

        // we can mutate this state as we please because we own this state
        const panel = this.state.panels.find(panel => panel.index === index)

        if (panel == null) {
            throw new Error('Unexpected invalid panel index: ' + index)
        }

        let didMutate = false

        switch (mode) {
            case 'toggle':
                // only one can be active, but also none can be active (radio, but allow unselect)
                this.state.panels.forEach(togglePanel => {
                    if (togglePanel !== panel && togglePanel.checked) {
                        togglePanel.checked = false
                    }
                })
                panel.checked = !panel.checked
                didMutate = true
                break
            case 'multiple':
                // no state restrictions/relations (checkbox)
                panel.checked = !panel.checked
                didMutate = true
                break
            default:
                // only one panel must stay active (radio)
                this.state.panels.forEach(togglePanel => {
                    if (togglePanel !== panel && togglePanel.checked) {
                        togglePanel.checked = false
                        didMutate = true
                    }
                })
                if (!panel.checked) {
                    panel.checked = true
                    didMutate = true
                }
        }

        if (didMutate) {
            this.setState({ panels: this.state.panels.slice(0) })
        }
    }

    render() {
        // use destructuring to pick out props we don't need to pass to the rendered component
        const {
            animateContent,
            children,
            component: Component,
            bemModifiers,
            bemSeparator,
            blockElements,
            component,
            initialPanels,
            mode,
            name,
            onChange,
            onPanels,
            panels: panelsProp,
            ...props
        } = this.props

        let panel = 0

        const panels = this.state.stateful ? this.state.panels : panelsProp
        const childPool = [children]
        const clones = []

        while (childPool.length) {
            Children.forEach(childPool.shift(), child => {
                if (child == null || !child.type) {
                    clones.push(child)
                } else if (child.type === React.Fragment) {
                    childPool.push(child.props.children)
                } else if (child.type.contextTypes && child.type.contextTypes.tabbordion) {
                    const clone = React.cloneElement(child, panels[panel])
                    panel++
                    clones.push(clone)
                } else {
                    clones.push(child)
                }
            })
        }

        return (
            <Component {...props} role="tablist">
                {Children.map(clones, identity)}
            </Component>
        )
    }
}

Tabbordion.childContextTypes = {
    bem: PropTypes.object,
    tabbordion: PropTypes.object,
}

Tabbordion.defaultProps = {
    animateContent: false,
    bemModifiers: {
        animated: 'animated',
        between: 'between',
        checked: 'checked',
        content: 'content',
        disabled: 'disabled',
        enabled: 'enabled',
        first: 'first',
        hidden: 'hidden',
        last: 'last',
        noContent: 'no-content',
        unchecked: 'unchecked',
    },
    bemSeparator: '--',
    blockElements: {
        animator: 'panel__animator',
        content: 'panel__content',
        label: 'panel__label',
        panel: 'panel',
    },
    component: 'ul',
    mode: 'single',
}

Tabbordion.propTypes = {
    animateContent: PropTypes.oneOf([false, 'height', 'marginTop']),
    bemModifiers: PropTypes.shape({
        between: PropTypes.string,
        checked: PropTypes.string,
        content: PropTypes.string,
        disabled: PropTypes.string,
        enabled: PropTypes.string,
        first: PropTypes.string,
        hidden: PropTypes.string,
        last: PropTypes.string,
        noContent: PropTypes.string,
        unchecked: PropTypes.string,
    }),
    bemSeparator: PropTypes.string,
    blockElements: PropTypes.shape({
        content: PropTypes.string,
        label: PropTypes.string,
        panel: PropTypes.string,
    }),
    children: PropTypes.node,
    className: PropTypes.string,
    component: PropTypes.oneOfType([PropTypes.func, PropTypes.object, PropTypes.string]),
    id: PropTypes.string,
    initialPanels: PropTypes.arrayOf(PropTypes.shape({
        checked: PropTypes.bool,
        disabled: PropTypes.bool,
        index: PropTypes.number,
        visible: PropTypes.bool,
    })),
    mode: PropTypes.oneOf(['single', 'toggle', 'multiple']),
    name: PropTypes.string,
    onChange: PropTypes.func,
    onPanels: PropTypes.func,
    panels: PropTypes.arrayOf(PropTypes.shape({
        checked: PropTypes.bool,
        disabled: PropTypes.bool,
        index: PropTypes.number,
        visible: PropTypes.bool,
    })),
}

export default Tabbordion
