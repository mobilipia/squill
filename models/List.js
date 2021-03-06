import .Resource;
import .Widget;
import ..Selection;

var List = exports = Class(Widget, function(supr) {
	this.init = function(opts) {
		opts = merge(opts, {
			isFixedSize: true,
			recycle: true
		});
		
		supr(this, 'init', [opts]);
		
		this._cellResource = new Resource();
		this._cells = {};
		this._needsSort = true;
		this._removed = {};
		this._renderOpts = {margin: 0};

		this.isRecycleEnabled = opts.recycle;

		this.updateOpts(opts);
	}

	this.updateOpts = function (opts) {
		if (this._opts) {
			for (var key in opts) {
				this._opts[key] = opts[key];
			}
		} else {
			this._opts = opts;
		}

		if (opts.getCell) { this.setCellGetter(opts.getCell); }
		if (opts.dataSource) { this.setDataSource(opts.dataSource); }
		if (opts.sorter) { this.setSorter(opts.sorter); }

		this._renderMargin = opts.renderMargin || 0;

		if (opts.selectable) {
			this.selection = new Selection({dataSource: this._dataSource, type: opts.selectable});
		}

		return this._opts;
	}
	
	this.setDataSource = function(dataSource) {
		this._dataSource = dataSource;
		this._dataSource.subscribe('Update', this, '_onUpdate');
		this._dataSource.subscribe('Remove', this, '_onRemove');
	}
	
	this._onUpdate = function(id, item) {
		var cell = this._cells[id];
		if (cell) { cell.setData(item, id); }
		this.needsSort();
	}
	
	this._onRemove = function(id, item) {
		this._removed[id] = true;
		this.needsSort();
	}
	
	this.needsSort = function() { this._needsSort = true; this._view.needsRepaint(); }
	
	this.setSelected = function(data) { this._selected = data; }
	this.getSelected = function() { return this._selected; }
	
	this.setCellGetter = function(getCell) { this._getCell = getCell; }
	this.getCellById = function(id) { return this._cells[id]; }
	
	this.setSorter = function(sorter) { this._sorter = sorter; }
	
	// just render all cells for now
	this.render = function(viewport) {
		if (this._needsSort) {
			this._needsSort = null;
			this._dataSource.sort();
		}
		
		var count = this._dataSource.length;
		if (this._opts.isFixedSize && count) {
			this.renderFixed(viewport);
		} else {
			this._removeCells(); // remove the views that were deleted from the datasource

			if (count) {
				this.renderVariable(viewport);
			}
		}
	}

	this.getRenderOpts = function() { return this._renderOpts; }

	// y is required for non-fixed-size lists.  Otherwise, y is ignored.
	this._positionCell = function(cell, i, y) {
		this._view.addCell(cell);

		var r = this._renderOpts;
		if (this._opts.isFixedSize) {
			if (this._opts.isTiled) {
				var x = i % r.numPerRow;
				var y = (i / r.numPerRow) | 0;
				cell.setPosition({
					x: x * r.fullWidth,
					y: y * r.fullHeight,
					width: r.cellWidth,
					height: r.cellHeight
				});
			} else {
				cell.setPosition({
					x: 0,
					y: i * r.fullHeight || 0,
					height: r.cellHeight
				});
			}
		} else {
			cell.setPosition({
					x: 0,
					y: y
				});
		}
	}
	
	this.renderVariable = function(viewport) {
		if (!this._dataSource) { return; }
		if (!this._updateRenderOpts(viewport)) { return; }
		
		var i = 0;
		var y = 0;
		function renderOne() {
			var item = this._dataSource.getItemForIndex(i);
			if (!item) {
				this._view.setMaxY(y);
				return false;
			}
			
			var id = item[this._dataSource.key];
			var cell = this._createCell(item);
			this._positionCell(cell, i, y);
			cell.needsRepaint();
			
			++i;
			y += cell.style.height;
			return true;
		}
		
		function renderMany() {
			var THRESHOLD = 50; // ms to render
			var n = 0, t = +new Date();
			while (n++ < 10 || +new Date() - t < THRESHOLD) {
				if (!renderOne.call(this)) { return; }
			}
			
			setTimeout(bind(this, renderMany), 100);
		}
		
		renderMany.call(this);
	}

	this._removeCells = function () {
		var removed = this._removed;
		this._removed = {};
		for (var id in removed) {
			if (!this._dataSource.getItemForID(id)) {
				var cell = this._cells[id];
				if (cell) {
					cell.remove(this);
					delete this._cells[id];
				}
			}
		}
	}

	this._createCell = function(item) {

		var id = item[this._dataSource.key];
		var cell = this._cells[id];
		if (!cell) {
			if (this.isRecycleEnabled) {
				cell = this._cellResource.get();
			}

			if (!cell) {
				cell = this._getCell(item, this._cellResource);
			}

			this._cells[id] = cell;
			cell.controller = this;
			cell.setData(item, id);
			cell.model.setResource(this._cellResource);
		}

		return cell;
	}
	
	this._updateRenderOpts = function(viewport) {
		var r = this._renderOpts;
		r.top = viewport.y - this._renderMargin;
		r.height = viewport.height + 2 * this._renderMargin;
		r.bottom = r.top + r.height;
		var n = r.numRows = this._dataSource.length;

		if (this._opts.isFixedSize) {
			if (!r.cellWidth || !r.cellHeight) {
				var item = this._dataSource.getItemForIndex(0);
				if (!item) { return false; }

				var key = item[this._dataSource.key];
				var cell = this._cells[key] || (this._cells[key] = this._createCell(item));
				r.fullWidth = r.cellWidth = cell.getWidth();
				r.fullHeight = r.cellHeight = cell.getHeight();
				if ((this._opts.isTiled && !r.cellWidth) || !r.cellHeight) { return null; }
				
				var margin = this._opts.margin || 0;
				if (margin) { r.fullWidth += margin; r.fullHeight += margin; }
			}
			
			if (this._opts.isTiled) {
				r.maxWidth = viewport.width;
				r.numPerRow = r.maxWidth / r.fullWidth | 0;
				r.numRows = Math.ceil(n / r.numPerRow);
				r.start = Math.max(0, (r.top / r.fullHeight | 0) * r.numPerRow);
				r.end = Math.ceil(r.bottom / r.fullHeight) * r.numPerRow;
			} else {
				r.start = Math.max(0, r.top / r.fullHeight | 0);
				r.end = (r.bottom / r.fullHeight + 1) | 0;
			}

			this._view.setMaxY(r.numRows * r.fullHeight);
		}
		
		return true;
	}

	this.renderFixed = function(viewport) {
		if (!(this._updateRenderOpts(viewport))) { return; }

		var r = this._renderOpts;
		var i = 0;
		var dataSource = this._dataSource;
		var key = dataSource.key;

		var cells = this._cells;
		var newCells = {};

		for (var i = r.start; i < r.end; ++i) {
			var item = dataSource.getItemForIndex(i);
			if (!item) {
				break;
			} else {
				var cell = this._createCell(item);
				if (cell) {
					newCells[item[key]] = cell;
					this._positionCell(cell, i);
					
					// we remove all cells in prevCells that aren't used.
					// mark it as used by deleting it.
					delete cells[item[key]];
				}
			}
		}
		
		for (var id in cells) {
			var cell = cells[id];

			cell.remove(this);
			if (this.isRecycleEnabled) {
				cell.model.recycle();
			}
		}
		
		this._cells = newCells;
	}
});
