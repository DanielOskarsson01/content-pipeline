import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './appStore'

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState({
      activeTab: 'projects',
      useMockData: true,
      toast: null,
    })
  })

  describe('activeTab', () => {
    it('should have projects as default tab', () => {
      expect(useAppStore.getState().activeTab).toBe('projects')
    })

    it('should update active tab', () => {
      useAppStore.getState().setActiveTab('monitor')
      expect(useAppStore.getState().activeTab).toBe('monitor')
    })
  })

  describe('useMockData', () => {
    it('should default to true (demo mode)', () => {
      expect(useAppStore.getState().useMockData).toBe(true)
    })

    it('should toggle mock data setting', () => {
      useAppStore.getState().setUseMockData(false)
      expect(useAppStore.getState().useMockData).toBe(false)
    })
  })

  describe('toast', () => {
    it('should be null initially', () => {
      expect(useAppStore.getState().toast).toBeNull()
    })

    it('should show toast with default type', () => {
      useAppStore.getState().showToast('Test message')
      const toast = useAppStore.getState().toast
      expect(toast?.message).toBe('Test message')
      expect(toast?.type).toBe('info')
    })

    it('should show toast with custom type', () => {
      useAppStore.getState().showToast('Error occurred', 'error')
      const toast = useAppStore.getState().toast
      expect(toast?.message).toBe('Error occurred')
      expect(toast?.type).toBe('error')
    })

    it('should hide toast', () => {
      useAppStore.getState().showToast('Test')
      useAppStore.getState().hideToast()
      expect(useAppStore.getState().toast).toBeNull()
    })
  })
})
