/**
 * Asset Container - Manages the asset library state using Ravioli
 *
 * This container demonstrates Ravioli's power for managing UI state.
 * It handles loading asset libraries, search/filter functionality, and
 * provides reactive representations for React components.
 */

import { createContainer } from '@warfog/ravioli';
import { AssetLibrary, Asset } from '../types/asset.types';
import defaultAssets from '../assets/examples/default-assets.json';

interface AssetData {
  library: AssetLibrary | null;
  searchQuery: string;
  selectedCategory: string | null;
}

// Create the asset container with Ravioli
export const assetContainer = createContainer<AssetData>()
  // Acceptor: Set the asset library
  .addAcceptor('setLibrary', {
    mutator(data, { library }: { library: AssetLibrary }) {
      data.library = library;
    }
  })

  // Acceptor: Update search query
  .addAcceptor('setSearchQuery', {
    mutator(data, { query }: { query: string }) {
      data.searchQuery = query;
    }
  })

  // Acceptor: Set selected category filter
  .addAcceptor('setCategory', {
    mutator(data, { category }: { category: string | null }) {
      data.selectedCategory = category;
    }
  })

  // Acceptor: Clear all filters
  .addAcceptor('clearFilters', {
    mutator(data) {
      data.searchQuery = '';
      data.selectedCategory = null;
    }
  })

  // Actions: High-level operations
  .addActions({
    loadLibraryFromJSON: 'setLibrary',
    searchAssets: 'setSearchQuery',
    filterByCategory: 'setCategory',
    clearFilters: 'clearFilters'
  })

  // Transformation: Create derived representation with filtered assets
  .addTransformation(({ data }) => {
    const { library, searchQuery, selectedCategory } = data;

    if (!library) {
      return {
        library: null,
        filteredAssets: [] as Asset[],
        categories: [] as string[],
        assetCount: 0
      };
    }

    // Combine all assets
    let allAssets: Asset[] = [
      ...library.acceptors,
      ...library.actions,
      ...library.controlStatePredicates,
      ...library.stepReactions
    ];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      allAssets = allAssets.filter(asset =>
        asset.name.toLowerCase().includes(query) ||
        asset.description?.toLowerCase().includes(query) ||
        asset.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply category filter
    if (selectedCategory) {
      allAssets = allAssets.filter(asset => asset.category === selectedCategory);
    }

    // Extract unique categories from library
    const categories = Array.from(
      new Set(
        [
          ...library.acceptors,
          ...library.actions,
          ...library.controlStatePredicates,
          ...library.stepReactions
        ]
          .map(asset => asset.category)
          .filter((cat): cat is string => !!cat)
      )
    ).sort();

    return {
      library,
      filteredAssets: allAssets,
      categories,
      assetCount: allAssets.length
    };
  })

  // Initialize with default asset library
  .create({
    library: defaultAssets as AssetLibrary,
    searchQuery: '',
    selectedCategory: null
  });

// Helper function to get asset by ID
export function getAssetById(id: string): Asset | undefined {
  const { library } = assetContainer.representationRef.current;
  if (!library) return undefined;

  const allAssets: Asset[] = [
    ...library.acceptors,
    ...library.actions,
    ...library.controlStatePredicates,
    ...library.stepReactions
  ];

  return allAssets.find(asset => asset.id === id);
}
